import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { omitCollectionOtp } from '../common/strip-secrets.js';
import { cancelOrderOnce } from '../orders/cancel-order.js';
import { WalletService } from '../wallet/wallet.service.js';
import { SmsService } from '../sms/sms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PhlebotomistSchedulingService } from '../phlebotomist/phlebotomist-scheduling.service.js';

const ORDER_DETAIL_INCLUDE = {
  user: { select: { id: true, phone: true, name: true } },
  items: true,
  slot: true,
  address: true,
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
  phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
  reports: true,
};

const ORDER_STATUS_VALUES = ['PENDING_PAYMENT', 'CONFIRMED', 'PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB', 'REPORT_READY', 'CANCELLED'];

// An order only ever moves forward through these; lab and phlebotomist cannot send it back.
const STATUS_RANK: Record<string, number> = { PENDING_PAYMENT: 0, CONFIRMED: 1, PHLEBOTOMIST_ASSIGNED: 2, SAMPLE_COLLECTED: 3, IN_LAB: 4, REPORT_READY: 5 };

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Booking confirmed',
  PHLEBOTOMIST_ASSIGNED: 'Phlebotomist assigned',
  SAMPLE_COLLECTED: 'Sample collected',
  IN_LAB: 'Your sample is in the lab',
  CANCELLED: 'Booking cancelled',
};

@Injectable()
export class LabOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly scheduling: PhlebotomistSchedulingService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly wallet: WalletService,
  ) {}

  async list(labId: string, status?: string) {
    if (status && !ORDER_STATUS_VALUES.includes(status)) throw new BadRequestException('Unknown order status');
    const orders = await this.prisma.order.findMany({
      where: { labId, ...(status ? { status: status as never } : {}) },
      include: ORDER_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return orders.map(omitCollectionOtp);
  }

  async get(labId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
    // Same "don't leak existence" convention as the patient-facing and phlebotomist-facing order
    // lookups — a lab asking for another lab's order id gets 404, not 403.
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    return omitCollectionOtp(order);
  }

  /**
   * Status + optional phlebotomist assignment, scoped to this lab's own orders and own
   * phlebotomist roster. Mirrors AdminOrdersController.updateStatus() but a lab can never set
   * REPORT_READY — report generation/approval stays a central admin action (see LabResultValue).
   */
  async updateStatus(
    labId: string,
    id: string,
    status: string,
    note: string | undefined,
    phlebotomistId: string | undefined,
    confirmUnverifiedTravel = false,
  ) {
    if (status === 'REPORT_READY') {
      throw new BadRequestException('Reports are generated and approved by MD Path Lab admin, not by the lab');
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and can no longer be updated');
    // Cancelling must refund the wallet exactly like the patient's own cancel does.
    if (status === 'CANCELLED') return this.cancelAsLab(labId, order.id, note);
    if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[order.status] ?? 0)) {
      throw new BadRequestException('An order cannot be moved back to an earlier status');
    }
    // A home collection goes assigned -> collected -> in lab; the lab cannot jump a booking straight to a later
    // step (e.g. mark the sample collected before any phlebotomist was assigned and the patient's code verified).
    if (order.collectionType === 'HOME' && (STATUS_RANK[status] ?? 0) - (STATUS_RANK[order.status] ?? 0) > 1) {
      throw new BadRequestException('This step cannot be skipped — move the booking forward one step at a time');
    }

    // Reassigning to a (possibly new) phlebotomist resets the whole per-visit workflow state —
    // accept/reject, on-the-way, arrival OTP — since none of that carries over to a different
    // person picking up the booking.
    const isNewAssignment = phlebotomistId && phlebotomistId !== order.phlebotomistId;

    // Lock → re-validate → write, all in one transaction, so two concurrent assignments of the same
    // phlebotomist can't both pass the schedule check before either commits.
    const updated = await this.prisma.$transaction(async (tx) => {
      let logNote = note;
      // Only a NEW assignment is schedule-checked. Re-sending the phlebotomist already on the
      // booking (e.g. with a plain status change) must not re-check an existing assignment.
      if (isNewAssignment) {
        await this.scheduling.lockPhlebotomist(tx, phlebotomistId);
        const manuallyReviewed = await this.validateAssignment(
          tx,
          labId,
          { ...order, itemCount: order.items.length },
          phlebotomistId,
          confirmUnverifiedTravel,
        );
        if (manuallyReviewed) logNote = [note, manuallyReviewed].filter(Boolean).join(' — ');
      }

      return tx.order.update({
        where: { id },
        data: {
          status: status as never,
          ...(phlebotomistId ? { phlebotomistId } : {}),
          ...(isNewAssignment
            ? {
                assignmentStatus: 'PENDING',
                assignmentRejectedReason: null,
                onTheWayAt: null,
                reachedAt: null,
                collectionOtp: null,
                collectionOtpVerifiedAt: null,
              }
            : {}),
          statusLogs: { create: { status: status as never, note: logNote, changedBy: `LAB:${labId}` } },
        },
        include: ORDER_DETAIL_INCLUDE,
      });
    });

    if (phlebotomistId && updated.phlebotomist) {
      await this.notifications.notifyUser(updated.phlebotomist.userId, {
        title: 'New booking assigned',
        body: `Order ${updated.orderNumber} — collection scheduled ${updated.scheduledDate?.toDateString() ?? ''}`,
        data: { type: 'ASSIGNMENT', orderId: updated.id },
      });
    }
    await this.notifications.notifyUser(updated.userId, {
      title: STATUS_LABELS[status] ?? 'Booking updated',
      body: `Order ${updated.orderNumber}`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status },
    });
    // Fire-and-forget: MailService never throws, and email must never slow this response.
    if (isNewAssignment) {
      void this.mail.phlebotomistAssignedForOrder(updated.id);
      void this.sms.orderSms(updated.id, 'phleboAssigned');
      void this.sms.phlebotomistSms(phlebotomistId!, 'newBooking', updated.id);
      if (order.phlebotomistId) void this.sms.phlebotomistSms(order.phlebotomistId, 'reassigned', updated.id);
    }

    return omitCollectionOtp(updated);
  }

  private async cancelAsLab(labId: string, orderId: string, note: string | undefined) {
    const outcome = await cancelOrderOnce(this.prisma, this.wallet, {
      orderId,
      note: note?.trim() || 'Cancelled by lab',
      changedBy: 'LAB:' + labId,
    });
    if (!outcome.changed) throw new BadRequestException('This order is cancelled and can no longer be updated');
    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
    await this.notifications.notifyUser(updated.userId, {
      title: STATUS_LABELS.CANCELLED ?? 'Booking cancelled',
      body: 'Order ' + updated.orderNumber,
      data: { type: 'ORDER_STATUS', orderId, status: 'CANCELLED' },
    });
    void this.mail.orderCancelledForOrder(updated.id, { reason: note, walletRefunded: outcome.walletRefunded });
    void this.sms.orderSms(updated.id, 'bookingCancelled');
    if (outcome.phlebotomistId) void this.sms.phlebotomistSms(outcome.phlebotomistId, 'cancelled', updated.id);
    return omitCollectionOtp(updated);
  }

  /**
   * The lab's own acknowledgment that a handed-over sample actually arrived — distinct from the
   * phlebotomist's own handedOverAt (see the schema comment on Order.sampleReceivedAt). This is
   * what now drives IN_LAB, not the handover call itself.
   */
  async receiveSample(labId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    if (!order.handedOverAt) {
      throw new BadRequestException('This booking has not been handed over by the phlebotomist yet');
    }
    if (order.sampleReceivedAt) {
      throw new BadRequestException('This sample has already been marked as received');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        sampleReceivedAt: new Date(),
        status: 'IN_LAB',
        statusLogs: { create: { status: 'IN_LAB', note: 'Sample received at lab', changedBy: `LAB:${labId}` } },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Your sample is in the lab',
      body: `Order ${updated.orderNumber} — testing will begin shortly`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'IN_LAB' },
    });

    return omitCollectionOtp(updated);
  }

  /**
   * Every candidate phlebotomist on this lab's roster, annotated with whether they can actually
   * take this specific booking — powers the "Assign Phlebotomist" picker so the lab only sees
   * suitable/available candidates first, per the scheduling requirement.
   */
  async listAvailablePhlebotomists(labId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');

    const roster = await this.prisma.phlebotomist.findMany({
      where: { labId },
      include: { user: { select: { name: true, phone: true } } },
    });

    const results = await this.scheduling.listCandidates(
      roster.map((p) => p.id),
      { id: order.id, scheduledDate: order.scheduledDate, slot: order.slot, address: order.address, itemCount: order.items.length },
    );
    const byId = new Map(roster.map((p) => [p.id, p]));

    return results.map((r) => {
      const p = byId.get(r.phlebotomistId)!;
      return {
        id: p.id,
        name: p.user.name,
        phone: p.user.phone,
        employeeCode: p.employeeCode,
        coverageCity: p.coverageCity,
        available: r.available,
        needsReview: r.needsReview,
        reason: r.available ? null : r.reason,
        // Why an available phlebotomist is available, e.g. "Visit around 2:32 PM, after booking …".
        note: r.available ? r.note : null,
        plannedStart: r.available ? r.plannedStart : null,
      };
    });
  }

  /** Returns an audit note when the assignment went through on a manual travel review, else null. */
  private async validateAssignment(
    tx: Prisma.TransactionClient,
    labId: string,
    order: { id: string; collectionType: string; scheduledDate: Date | null; slot: { startTime: string; endTime: string; label?: string } | null; address: { lat: number | null; lng: number | null } | null; itemCount: number },
    phlebotomistId: string,
    confirmUnverifiedTravel: boolean,
  ): Promise<string | null> {
    if (order.collectionType !== 'HOME') {
      throw new BadRequestException('Only home-collection bookings can be assigned to a phlebotomist');
    }

    const phlebotomist = await tx.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist || phlebotomist.labId !== labId) {
      throw new NotFoundException('Phlebotomist not found');
    }
    if (phlebotomist.status !== 'ACTIVE') {
      throw new BadRequestException('This phlebotomist is not active and cannot be assigned a booking');
    }

    const result = await this.scheduling.checkAvailability(
      phlebotomistId,
      { id: order.id, scheduledDate: order.scheduledDate, slot: order.slot, address: order.address, itemCount: order.itemCount },
      tx,
    );
    if (result.available) return null;
    if (!result.needsReview) {
      throw new BadRequestException(`This phlebotomist can't take this booking — ${result.reason}`);
    }
    // 409 (not 400) so the UI can tell "needs a human to confirm" apart from "impossible".
    if (!confirmUnverifiedTravel) throw new ConflictException(`Manual review required — ${result.reason}`);
    return `Assigned on manual travel review: ${result.reason}`;
  }
}
