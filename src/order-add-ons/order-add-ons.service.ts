import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderAddOn, Prisma } from '@prisma/client';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type ItemType = 'PARAMETER' | 'PROFILE' | 'PACKAGE';
export type AddOnItem = { itemType: ItemType; itemId: string; itemName: string; mrp: number; price: number; familyMemberId: string | null };

const EXPIRY_MINUTES = 30;
const MAX_ITEMS = 10;

/**
 * Tests a phlebotomist adds at the patient's door because the patient forgot to book them. The phlebotomist
 * only ever REQUESTS — nothing on the order changes until the patient confirms in their own app/website
 * (that confirmation is the security check). On confirm the lines are added to the same order, the order
 * totals go up, and everything that reads the order's items (samples to collect, lab, receipt, admin) follows.
 */
@Injectable()
export class OrderAddOnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private serialize(a: OrderAddOn) {
    return {
      id: a.id,
      orderId: a.orderId,
      status: a.status,
      items: a.items as unknown as AddOnItem[],
      amount: a.amount,
      note: a.note,
      expiresAt: a.expiresAt,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt,
    };
  }

  /** A request nobody answered in time simply stops being actionable; done lazily on every read/write. */
  private async expireStale(orderId: string) {
    await this.prisma.orderAddOn.updateMany({
      where: { orderId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
  }

  // ---------- phlebotomist ----------

  async listForPhlebotomist(phlebotomistId: string, orderId: string) {
    await this.requireOwnOrder(phlebotomistId, orderId);
    await this.expireStale(orderId);
    const rows = await this.prisma.orderAddOn.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.serialize(r));
  }

  async request(
    phlebotomistId: string,
    orderId: string,
    dto: { items: { itemType: ItemType; itemId: string; familyMemberId?: string }[]; note?: string },
  ) {
    const order = await this.requireOwnOrder(phlebotomistId, orderId);
    if (order.collectionType !== 'HOME') throw new BadRequestException('Tests can only be added to a home-collection booking');
    if (order.status !== 'PHLEBOTOMIST_ASSIGNED') {
      throw new BadRequestException('Tests can only be added before the sample is collected');
    }
    if (!order.reachedAt) throw new BadRequestException('Mark the booking as reached before adding tests');

    await this.expireStale(orderId);
    const pending = await this.prisma.orderAddOn.findFirst({ where: { orderId, status: 'PENDING' } });
    if (pending) {
      throw new ConflictException('A request is already waiting for the patient to confirm — cancel it first to send a new one');
    }

    if (dto.items.length === 0) throw new BadRequestException('Select at least one test');
    if (dto.items.length > MAX_ITEMS) throw new BadRequestException(`You can add at most ${MAX_ITEMS} tests at a time`);

    const seen = new Set(order.items.map((i) => `${i.itemType}:${i.itemId}`));
    for (const item of dto.items) {
      const key = `${item.itemType}:${item.itemId}`;
      if (seen.has(key)) throw new BadRequestException('One of these tests is already in this booking or was selected twice');
      seen.add(key);
    }

    // The lab fulfilling this booking must actually offer what is being added.
    if (order.labId) {
      const offered = await this.prisma.labCatalogueItem.findMany({
        where: { labId: order.labId, OR: dto.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })) },
        select: { itemType: true, itemId: true },
      });
      const offeredKeys = new Set(offered.map((o) => `${o.itemType}:${o.itemId}`));
      const missing = dto.items.find((i) => !offeredKeys.has(`${i.itemType}:${i.itemId}`));
      if (missing) throw new BadRequestException('One of these tests is not offered by the lab handling this booking');
    }

    // Default the patient to whoever the booking's first test is for, unless a family member is named.
    const defaultMember = order.items[0]?.familyMemberId ?? null;
    const resolved: AddOnItem[] = [];
    for (const item of dto.items) {
      let familyMemberId = item.familyMemberId ?? defaultMember;
      if (item.familyMemberId) {
        const member = await this.prisma.familyMember.findFirst({ where: { id: item.familyMemberId, userId: order.userId }, select: { id: true } });
        if (!member) throw new BadRequestException('Family member not found for this patient');
        familyMemberId = member.id;
      }
      const c = await this.catalogue.resolveItem(item.itemType, item.itemId, order.address?.city ?? undefined);
      resolved.push({ itemType: item.itemType, itemId: item.itemId, itemName: c.name, mrp: c.mrp, price: c.price, familyMemberId });
    }
    const amount = resolved.reduce((sum, i) => sum + i.price, 0);

    const created = await this.prisma.orderAddOn.create({
      data: {
        orderId,
        phlebotomistId,
        items: resolved as unknown as Prisma.InputJsonValue,
        amount,
        note: dto.note?.trim() || null,
        expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60_000),
      },
    });

    const names = resolved.map((i) => i.itemName).join(', ');
    await this.notifications.notifyUser(order.userId, {
      title: 'Please confirm extra tests',
      body: `Your phlebotomist wants to add ${names} (₹${amount}) to order ${order.orderNumber}. Confirm in the app to add them.`,
      data: { type: 'ORDER_ADDON_REQUEST', orderId, addOnId: created.id, status: 'PENDING' },
    });
    void this.mail.addOnRequested(order.userId, {
      orderNumber: order.orderNumber,
      orderId,
      items: resolved.map((i) => i.itemName),
      amount,
      phlebotomist: order.phlebotomist?.user.name ?? 'Your phlebotomist',
    });
    return this.serialize(created);
  }

  async cancelByPhlebotomist(phlebotomistId: string, orderId: string, addOnId: string) {
    await this.requireOwnOrder(phlebotomistId, orderId);
    const claimed = await this.prisma.orderAddOn.updateMany({
      where: { id: addOnId, orderId, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    if (claimed.count !== 1) throw new BadRequestException('This request can no longer be cancelled');
    return { ok: true };
  }

  private async requireOwnOrder(phlebotomistId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, address: { select: { city: true } }, phlebotomist: { include: { user: { select: { name: true } } } } },
    });
    if (!order || order.phlebotomistId !== phlebotomistId) throw new NotFoundException('Booking not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled');
    return order;
  }

  // ---------- patient ----------

  async listForPatient(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    await this.expireStale(orderId);
    const rows = await this.prisma.orderAddOn.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.serialize(r));
  }

  async respond(userId: string, orderId: string, addOnId: string, decision: 'CONFIRM' | 'REJECT') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { phlebotomist: { select: { userId: true } } },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    await this.expireStale(orderId);

    const addOn = await this.prisma.orderAddOn.findFirst({ where: { id: addOnId, orderId } });
    if (!addOn) throw new NotFoundException('Request not found');
    if (addOn.status !== 'PENDING') {
      throw new BadRequestException(
        addOn.status === 'EXPIRED' ? 'This request has expired — ask your phlebotomist to send it again' : `This request was already ${addOn.status.toLowerCase()}`,
      );
    }

    if (decision === 'REJECT') {
      await this.prisma.orderAddOn.updateMany({ where: { id: addOnId, status: 'PENDING' }, data: { status: 'REJECTED', respondedAt: new Date() } });
      await this.tellPhlebotomist(order, 'Patient declined the extra tests', `Order ${order.orderNumber} — the patient did not agree to the added tests.`, 'REJECTED', addOnId);
      return { ...this.serialize((await this.prisma.orderAddOn.findUnique({ where: { id: addOnId } }))!), order: null };
    }

    if (order.status !== 'PHLEBOTOMIST_ASSIGNED') {
      throw new BadRequestException('This booking has moved on, so tests can no longer be added to it');
    }

    const items = addOn.items as unknown as AddOnItem[];
    const updated = await this.prisma.$transaction(async (tx) => {
      // Only the call that actually flips PENDING -> CONFIRMED may add the lines, so a double tap or a
      // retried request can never add them twice.
      const claimed = await tx.orderAddOn.updateMany({ where: { id: addOnId, status: 'PENDING' }, data: { status: 'CONFIRMED', respondedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('This request was already answered');
      await tx.orderItem.createMany({
        data: items.map((i) => ({
          orderId,
          addOnId,
          itemType: i.itemType,
          itemId: i.itemId,
          itemName: i.itemName,
          mrp: i.mrp,
          price: i.price,
          familyMemberId: i.familyMemberId,
        })),
      });
      return tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: { increment: addOn.amount },
          total: { increment: addOn.amount },
          addOnTotal: { increment: addOn.amount },
          statusLogs: {
            create: {
              status: order.status,
              note: `Tests added at the door (confirmed by patient): ${items.map((i) => i.itemName).join(', ')} — ₹${addOn.amount}`,
              changedBy: 'PATIENT',
            },
          },
        },
        include: { items: true },
      });
    });

    await this.tellPhlebotomist(
      order,
      'Patient confirmed the extra tests',
      `Order ${order.orderNumber} — ${items.map((i) => i.itemName).join(', ')} added. Collect these samples too and ₹${addOn.amount} extra payment.`,
      'CONFIRMED',
      addOnId,
    );
    await this.notifications.notifyAdmins({
      title: 'Tests added at the door',
      body: `Order ${order.orderNumber} — ${items.map((i) => i.itemName).join(', ')} (₹${addOn.amount})`,
      data: { type: 'ORDER_ADDON_UPDATE', orderId, addOnId, status: 'CONFIRMED' },
    });
    void this.mail.addOnConfirmed(userId, {
      orderNumber: order.orderNumber,
      orderId,
      items: items.map((i) => i.itemName),
      amount: addOn.amount,
      total: updated.total,
    });
    return { ...this.serialize((await this.prisma.orderAddOn.findUnique({ where: { id: addOnId } }))!), order: { id: updated.id, subtotal: updated.subtotal, total: updated.total, addOnTotal: updated.addOnTotal, items: updated.items } };
  }

  private async tellPhlebotomist(order: { id: string; phlebotomist: { userId: string } | null }, title: string, body: string, status: string, addOnId: string) {
    if (!order.phlebotomist) return;
    await this.notifications.notifyUser(order.phlebotomist.userId, {
      title,
      body,
      data: { type: 'ORDER_ADDON_UPDATE', orderId: order.id, addOnId, status },
    });
  }
}
