import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PhlebotomistSchedulingService } from '../phlebotomist/phlebotomist-scheduling.service.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';

const ORDER_DETAIL_INCLUDE = {
  user: { select: { id: true, phone: true, name: true } },
  items: true,
  slot: true,
  address: true,
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
  phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
  reports: true,
};

// Patient-facing labels for the tracking timeline (FSD §1.1.3.2) — used only to word the push
// notification sent on each status change, not stored anywhere.
const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Booking confirmed',
  PHLEBOTOMIST_ASSIGNED: 'Phlebotomist assigned',
  SAMPLE_COLLECTED: 'Sample collected',
  IN_LAB: 'Your sample is in the lab',
  REPORT_READY: 'Your report is ready',
  CANCELLED: 'Booking cancelled',
};

@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly scheduling: PhlebotomistSchedulingService,
  ) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as never } : {},
      include: {
        user: { select: { id: true, phone: true, name: true } },
        items: true,
        slot: true,
        address: true,
        phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
        reports: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
  }

  /**
   * Manual status progression (and optional phlebotomist assignment) — this IS the interim
   * field-coordination mechanism for Phase 1, per the development plan: an operator moves a
   * booking through its lifecycle by phone/WhatsApp with the phlebotomist until the dedicated
   * field app ships in Phase 2.
   */
  @Patch(':id/status')
  async updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    // A cancelled order is a terminal record — neither its status nor its phlebotomist
    // assignment should be mutable afterward. This does not restrict any other transition
    // (e.g. CONFIRMED → SAMPLE_COLLECTED → IN_LAB remain fully unguarded, per the FSD not
    // defining a transition allow-list).
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and can no longer be updated');

    const isNewAssignment = dto.phlebotomistId && dto.phlebotomistId !== order.phlebotomistId;

    // Lock → re-validate → write in one transaction — same reasoning as LabOrdersService.updateStatus.
    const updated = await this.prisma.$transaction(async (tx) => {
      let logNote = dto.note;
      // Only a NEW assignment is schedule-checked — same rule as LabOrdersService.updateStatus.
      if (isNewAssignment) {
        await this.scheduling.lockPhlebotomist(tx, dto.phlebotomistId!);
        const manuallyReviewed = await this.validateAssignment(
          tx,
          { ...order, itemCount: order.items.length },
          dto.phlebotomistId!,
          dto.confirmUnverifiedTravel ?? false,
        );
        if (manuallyReviewed) logNote = [dto.note, manuallyReviewed].filter(Boolean).join(' — ');
      }

      return tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.phlebotomistId ? { phlebotomistId: dto.phlebotomistId } : {}),
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
          statusLogs: {
            create: { status: dto.status, note: logNote, changedBy: req.admin.email },
          },
        },
        // Must match list()/get()/cancel()'s shape — the frontend replaces the order in its list
        // with this exact response, so a narrower `include` here silently drops user/address/slot/
        // phlebotomist from that row and crashes the next render (e.g. `o.user.phone` on undefined).
        include: ORDER_DETAIL_INCLUDE,
      });
    });

    if (dto.phlebotomistId && updated.phlebotomist) {
      await this.notifications.notifyUser(updated.phlebotomist.userId, {
        title: 'New booking assigned',
        body: `Order ${updated.orderNumber} — collection scheduled ${updated.scheduledDate?.toDateString() ?? ''}`,
        data: { type: 'ASSIGNMENT', orderId: updated.id },
      });
    }
    await this.notifications.notifyUser(updated.userId, {
      title: STATUS_LABELS[dto.status] ?? 'Booking updated',
      body: `Order ${updated.orderNumber}`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: dto.status },
    });

    return updated;
  }

  /**
   * FSD §3.8 — "Assign Booking — assign a home-collection booking to an available phlebotomist
   * by area and slot." "Area" has no strict zone model in this schema (only free-text
   * coverageCity), so it is deliberately NOT enforced as a hard filter here — the admin UI
   * surfaces it as a sort hint instead (see the frontend change). "Available" now means a real
   * schedule check (PhlebotomistSchedulingService) — finish-previous-collection + travel time +
   * buffer — not just "no other booking in the exact same slot".
   */
  private async validateAssignment(
    tx: Prisma.TransactionClient,
    order: { id: string; collectionType: string; scheduledDate: Date | null; slot: { startTime: string; endTime: string; label?: string } | null; address: { lat: number | null; lng: number | null } | null; itemCount: number },
    phlebotomistId: string,
    confirmUnverifiedTravel: boolean,
  ): Promise<string | null> {
    if (order.collectionType !== 'HOME') {
      throw new BadRequestException('Only home-collection bookings can be assigned to a phlebotomist');
    }

    const phlebotomist = await tx.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist) throw new NotFoundException('Phlebotomist not found');
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
    // Same contract as LabOrdersService.validateAssignment: 409 until a human confirms.
    if (!confirmUnverifiedTravel) throw new ConflictException(`Manual review required — ${result.reason}`);
    return `Assigned on manual travel review: ${result.reason}`;
  }

  /** Same idea as LabOrdersController's equivalent — every phlebotomist annotated with whether
   * they can take this specific booking, for the admin's own "Assign Phlebotomist" picker. */
  @Get(':id/available-phlebotomists')
  async listAvailablePhlebotomists(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const roster = await this.prisma.phlebotomist.findMany({ include: { user: { select: { name: true, phone: true } } } });
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
      };
    });
  }

  /**
   * Mirrors the patient-facing OrdersService.cancel() rule exactly (the only existing
   * cancellation rule in this codebase: an order already CANCELLED cannot be cancelled again) —
   * admin cancellation is deliberately not window-limited like the patient one, since admin is
   * the reviewing authority handling requests that may arrive after the patient's own cutoff.
   * Reason is mandatory here (unlike updateStatus's optional `note`), per the FSD's "Enter
   * Cancellation Reason" step. Refund is explicitly out of scope for this endpoint.
   */
  @Post(':id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('Order is already cancelled');

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        statusLogs: {
          create: { status: 'CANCELLED', note: `Cancelled by admin — ${dto.reason}`, changedBy: req.admin.email },
        },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    await this.notifications.notifyUser(updated.userId, {
      title: STATUS_LABELS.CANCELLED!,
      body: `Order ${updated.orderNumber} — ${dto.reason}`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'CANCELLED' },
    });

    return updated;
  }

  /**
   * Admin-side equivalent of LabOrdersService.receiveSample() — for orders with no partner lab
   * (CENTER visits, or pre-multi-lab bookings) admin is the one acknowledging the sample actually
   * arrived, distinct from the phlebotomist's own handedOverAt.
   */
  @Patch(':id/receive-sample')
  async receiveSample(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
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
        statusLogs: { create: { status: 'IN_LAB', note: 'Sample received at lab', changedBy: 'ADMIN' } },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    await this.notifications.notifyUser(updated.userId, {
      title: STATUS_LABELS.IN_LAB!,
      body: `Order ${updated.orderNumber} — testing will begin shortly`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'IN_LAB' },
    });

    return updated;
  }
}
