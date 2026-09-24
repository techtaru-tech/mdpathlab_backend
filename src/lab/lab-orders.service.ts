import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

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

    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and can no longer be updated');

    if (phlebotomistId) {
      await this.validateAssignment(labId, order, phlebotomistId);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: status as never,
        ...(phlebotomistId ? { phlebotomistId } : {}),
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

  private async validateAssignment(labId: string, order: { id: string; collectionType: string; scheduledDate: Date | null; slotId: string | null }, phlebotomistId: string) {
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
}
