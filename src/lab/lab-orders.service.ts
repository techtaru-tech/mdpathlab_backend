import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
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
  ) {}

  list(labId: string, status?: string) {
    return this.prisma.order.findMany({
      where: { labId, ...(status ? { status: status as never } : {}) },
      include: ORDER_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(labId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
    // Same "don't leak existence" convention as the patient-facing and phlebotomist-facing order
    // lookups — a lab asking for another lab's order id gets 404, not 403.
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Status + optional phlebotomist assignment, scoped to this lab's own orders and own
   * phlebotomist roster. Mirrors AdminOrdersController.updateStatus() but a lab can never set
   * REPORT_READY — report generation/approval stays a central admin action (see LabResultValue).
   */
  async updateStatus(labId: string, id: string, status: string, note: string | undefined, phlebotomistId: string | undefined) {
    if (status === 'REPORT_READY') {
      throw new BadRequestException('Reports are generated and approved by MD Path Lab admin, not by the lab');
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and can no longer be updated');

    if (phlebotomistId) {
      await this.validateAssignment(labId, { ...order, itemCount: order.items.length }, phlebotomistId);
    }

    // Reassigning to a (possibly new) phlebotomist resets the whole per-visit workflow state —
    // accept/reject, on-the-way, arrival OTP — since none of that carries over to a different
    // person picking up the booking.
    const isNewAssignment = phlebotomistId && phlebotomistId !== order.phlebotomistId;

    const updated = await this.prisma.order.update({
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
        statusLogs: { create: { status: status as never, note, changedBy: `LAB:${labId}` } },
      },
      include: ORDER_DETAIL_INCLUDE,
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

    return updated;
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

    return updated;
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
        reason: r.available ? null : r.reason,
      };
    });
  }

  private async validateAssignment(labId: string, order: { id: string; collectionType: string; scheduledDate: Date | null; slot: { startTime: string; endTime: string; label?: string } | null; address: { lat: number | null; lng: number | null } | null; itemCount: number }, phlebotomistId: string) {
    if (order.collectionType !== 'HOME') {
      throw new BadRequestException('Only home-collection bookings can be assigned to a phlebotomist');
    }

    const phlebotomist = await this.prisma.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist || phlebotomist.labId !== labId) {
      throw new NotFoundException('Phlebotomist not found');
    }
    if (phlebotomist.status !== 'ACTIVE') {
      throw new BadRequestException('This phlebotomist is not active and cannot be assigned a booking');
    }

    const result = await this.scheduling.checkAvailability(phlebotomistId, {
      id: order.id,
      scheduledDate: order.scheduledDate,
      slot: order.slot,
      address: order.address,
      itemCount: order.itemCount,
    });
    if (!result.available) {
      throw new BadRequestException(`This phlebotomist can't take this booking — ${result.reason}`);
    }
  }
}
