import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    // A cancelled order is a terminal record — neither its status nor its phlebotomist
    // assignment should be mutable afterward. This does not restrict any other transition
    // (e.g. CONFIRMED → SAMPLE_COLLECTED → IN_LAB remain fully unguarded, per the FSD not
    // defining a transition allow-list).
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and can no longer be updated');

    if (dto.phlebotomistId) {
      await this.validateAssignment(order, dto.phlebotomistId);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.phlebotomistId ? { phlebotomistId: dto.phlebotomistId } : {}),
        statusLogs: {
          create: { status: dto.status, note: dto.note, changedBy: req.admin.email },
        },
      },
      // Must match list()/get()/cancel()'s shape — the frontend replaces the order in its list
      // with this exact response, so a narrower `include` here silently drops user/address/slot/
      // phlebotomist from that row and crashes the next render (e.g. `o.user.phone` on undefined).
      include: ORDER_DETAIL_INCLUDE,
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
   * surfaces it as a sort hint instead (see the frontend change). "Available" and "by slot" ARE
   * concrete and enforced: ACTIVE status, and no conflicting HOME booking in the same slot/date.
   */
  private async validateAssignment(order: { id: string; collectionType: string; scheduledDate: Date | null; slotId: string | null }, phlebotomistId: string) {
    if (order.collectionType !== 'HOME') {
      throw new BadRequestException('Only home-collection bookings can be assigned to a phlebotomist');
    }

    const phlebotomist = await this.prisma.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist) throw new NotFoundException('Phlebotomist not found');
    if (phlebotomist.status !== 'ACTIVE') {
      throw new BadRequestException('This phlebotomist is not active and cannot be assigned a booking');
    }

    if (order.scheduledDate && order.slotId) {
      const conflict = await this.prisma.order.findFirst({
        where: {
          id: { not: order.id },
          phlebotomistId,
          scheduledDate: order.scheduledDate,
          slotId: order.slotId,
          status: { not: 'CANCELLED' },
        },
      });
      if (conflict) {
        throw new BadRequestException('This phlebotomist is already assigned to another booking in the same time slot');
      }
    }
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
}
