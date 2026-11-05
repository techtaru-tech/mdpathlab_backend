import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isPastIstSlot } from '../common/ist-time.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlotsService } from '../slots/slots.service.js';
import { SmsService } from '../sms/sms.service.js';
import type { AdminCreateBookingDto, AdminEditBookingDto } from './dto/admin-booking.dto.js';

// Before the sample is collected a booking can still be changed; after that the tests and visit are a fact.
export const EDITABLE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PHLEBOTOMIST_ASSIGNED'];

const lineKey = (l: { itemType: string; itemId: string; familyMemberId: string | null }) => `${l.itemType}:${l.itemId}:${l.familyMemberId ?? ''}`;
const dateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Bookings admin makes or changes for a patient. Everything goes through the same rules as the patient's own
 * checkout (OrdersService.priceOrder for prices, lab routing and the collection fee; SlotsService for capacity),
 * so a booking admin makes or edits can never be one the website would have refused.
 */
@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly coupons: CouponsService,
    private readonly slots: SlotsService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  private async requirePatient(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
    if (!user || user.role !== 'PATIENT') throw new NotFoundException('Patient not found');
    if (user.status !== 'ACTIVE') throw new BadRequestException('This patient account is not active');
  }

  private async requireBookableSlot(slotId: string, date: string) {
    const slot = await this.prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
    if (isPastIstSlot(date, slot.startTime)) throw new BadRequestException('This slot has already passed — choose an upcoming date or time');
    return slot;
  }

  /** The price summary for the create form — nothing is held or created. */
  async quote(dto: AdminCreateBookingDto) {
    await this.requirePatient(dto.userId);
    const p = await this.orders.priceOrder(dto.userId, dto.items, dto.collectionType, dto.addressId, dto.collectionCenterId, dto.couponCode, false, undefined, undefined);
    const lab = p.labId ? await this.prisma.lab.findUnique({ where: { id: p.labId }, select: { name: true } }) : null;
    return {
      items: p.resolvedItems.map(({ cartItem, catalogueItem }) => ({ itemType: cartItem.itemType, itemId: cartItem.itemId, name: catalogueItem.name, mrp: catalogueItem.mrp, price: catalogueItem.price })),
      subtotal: p.subtotal,
      discount: p.discount,
      collectionFee: p.collectionFee,
      feeCalculable: p.feeCalculable,
      withinRange: p.withinRange,
      total: p.total,
      labName: lab?.name ?? null,
    };
  }

  async create(adminEmail: string, dto: AdminCreateBookingDto) {
    await this.requirePatient(dto.userId);
    await this.requireBookableSlot(dto.slotId, dto.scheduledDate);
    const p = await this.orders.priceOrder(dto.userId, dto.items, dto.collectionType, dto.addressId, dto.collectionCenterId, dto.couponCode, false, undefined, undefined);
    const note = ['Booked by admin — pay on collection', dto.note?.trim()].filter(Boolean).join(' — ');

    const order = await this.prisma.$transaction((tx) =>
      this.orders.createOrderInTx(tx, dto.userId, {
        collectionType: dto.collectionType,
        addressId: dto.collectionType === 'HOME' || p.labId ? dto.addressId : undefined,
        collectionCenterId: dto.collectionType === 'CENTER' ? dto.collectionCenterId : undefined,
        slotId: dto.slotId,
        scheduledDate: dto.scheduledDate,
        labId: p.labId,
        couponId: p.couponId,
        subtotal: p.subtotal,
        discount: p.discount,
        collectionFee: p.collectionFee,
        walletUsed: 0,
        total: p.total,
        lines: p.resolvedItems.map(({ cartItem, catalogueItem }) => ({
          itemType: cartItem.itemType,
          itemId: cartItem.itemId,
          familyMemberId: cartItem.familyMemberId ?? null,
          itemName: catalogueItem.name,
          mrp: catalogueItem.mrp,
          price: catalogueItem.price,
        })),
        paymentMethod: 'COD',
        requireCart: false,
        keepCart: true,
        note,
        changedBy: adminEmail,
      }),
    );
    // Same confirmation the patient gets for their own booking (app, email, SMS), and the admin alert.
    await this.orders.announceNewOrder(order.id, 'COD');
    return order;
  }

  /**
   * Changes a booking that has not been collected yet: the visit date/slot, the address (home) or centre, and the
   * tests. Tests that stay keep the price they were booked at; new ones are priced as checkout would price them
   * today. A paid booking can change everything except its amount. Moving the visit (date, slot, address or lab)
   * takes it off the assigned phlebotomist's list so it is assigned again for the new visit.
   */
  async edit(adminEmail: string, id: string, dto: AdminEditBookingDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, coupon: true, slot: true, address: true, phlebotomist: { select: { id: true, userId: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled and can no longer be changed');
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException('The sample has already been collected, so this booking can no longer be changed');
    }

    const date = dto.scheduledDate ?? dateString(order.scheduledDate);
    const slotId = dto.slotId ?? order.slotId;
    const addressId = dto.addressId ?? order.addressId ?? undefined;
    const centreId = dto.collectionCenterId ?? order.collectionCenterId ?? undefined;
    if (dto.addressId && order.collectionType !== 'HOME' && !order.labId) throw new BadRequestException('A centre visit has no address to change');
    if (dto.collectionCenterId && order.collectionType !== 'CENTER') throw new BadRequestException('A home collection has no centre to change');

    const scheduleChanged = date !== dateString(order.scheduledDate) || slotId !== order.slotId;
    if (scheduleChanged) {
      if (!date || !slotId) throw new BadRequestException('Choose both a date and a slot');
      await this.requireBookableSlot(slotId, date);
    }

    const current = order.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, familyMemberId: i.familyMemberId }));
    const wanted = dto.items?.map((i) => ({ itemType: i.itemType, itemId: i.itemId, familyMemberId: i.familyMemberId ?? null })) ?? current;
    if (new Set(wanted.map(lineKey)).size !== wanted.length) throw new BadRequestException('A test is listed twice');
    const itemsChanged = dto.items !== undefined && [...wanted.map(lineKey)].sort().join('|') !== [...current.map(lineKey)].sort().join('|');
    const addressChanged = addressId !== (order.addressId ?? undefined);
    const centreChanged = centreId !== (order.collectionCenterId ?? undefined);
    if (itemsChanged) {
      const pending = await this.prisma.orderAddOn.findFirst({ where: { orderId: id, status: 'PENDING', expiresAt: { gt: new Date() } } });
      if (pending) throw new BadRequestException('Extra tests requested at the door are waiting for the patient — wait for that first');
    }
    if (!scheduleChanged && !itemsChanged && !addressChanged && !centreChanged) throw new BadRequestException('Nothing was changed');

    // Re-run checkout's own checks and routing on the booking as it will be (address ownership, radiology rules,
    // family members, which lab covers this address for these tests, the collection fee).
    const p = await this.orders.priceOrder(order.userId, wanted, order.collectionType, addressId, centreId, undefined, false, undefined, undefined);
    const keptByKey = new Map(order.items.map((i) => [lineKey(i), i]));
    const kept = order.items.filter((i) => wanted.some((w) => lineKey(w) === lineKey(i)));
    const removed = order.items.filter((i) => !kept.includes(i));
    const added = p.resolvedItems
      .filter(({ cartItem }) => !keptByKey.has(lineKey({ ...cartItem, familyMemberId: cartItem.familyMemberId ?? null })))
      .map(({ cartItem, catalogueItem }) => ({
        itemType: cartItem.itemType,
        itemId: cartItem.itemId,
        familyMemberId: cartItem.familyMemberId ?? null,
        itemName: catalogueItem.name,
        mrp: catalogueItem.mrp,
        price: catalogueItem.price,
      }));
    const subtotal = kept.reduce((s, i) => s + i.price, 0) + added.reduce((s, i) => s + i.price, 0);

    let discount = 0;
    if (order.coupon) {
      if (order.coupon.minOrderValue !== null && subtotal < order.coupon.minOrderValue) {
        throw new BadRequestException(`Coupon ${order.coupon.code} needs a booking of at least ₹${order.coupon.minOrderValue}`);
      }
      discount = this.coupons.computeDiscount(order.coupon, subtotal);
    }
    const collectionFee = addressChanged || centreChanged ? p.collectionFee : order.collectionFee;
    const total = subtotal - discount + collectionFee - order.walletAmountUsed;
    if (total < 0) throw new BadRequestException('The wallet amount already used is more than the new total');
    if (order.paymentStatus === 'PAID' && total !== order.total) {
      throw new BadRequestException(
        `This booking is already paid (₹${order.total}); the change would make it ₹${total}. Cancel it (the refund follows the usual rules) and create a new booking instead.`,
      );
    }
    const labId = p.labId;
    const visitMoved = scheduleChanged || addressChanged || centreChanged || labId !== order.labId;
    const unassign = visitMoved && order.phlebotomistId !== null;
    const status = unassign && order.status === 'PHLEBOTOMIST_ASSIGNED' ? 'CONFIRMED' : order.status;

    const changes: string[] = [];
    if (scheduleChanged) {
      const slot = await this.prisma.slot.findUnique({ where: { id: slotId! }, select: { label: true } });
      changes.push(`visit moved to ${date} ${slot?.label ?? ''}`.trim());
    }
    if (addressChanged) changes.push('address changed');
    if (centreChanged) changes.push('collection centre changed');
    if (added.length) changes.push(`added ${added.map((i) => i.itemName).join(', ')}`);
    if (removed.length) changes.push(`removed ${removed.map((i) => i.itemName).join(', ')}`);
    if (total !== order.total) changes.push(`total ₹${order.total} → ₹${total}`);
    if (unassign) changes.push('phlebotomist to be assigned again');
    const summary = changes.join('; ');

    await this.prisma.$transaction(async (tx) => {
      if (scheduleChanged) {
        await this.slots.reserveCapacityOrThrow(tx, slotId!, date!, order.collectionType, order.collectionType === 'CENTER' ? centreId : undefined);
      }
      if (removed.length) await tx.orderItem.deleteMany({ where: { id: { in: removed.map((i) => i.id) } } });
      if (added.length) await tx.orderItem.createMany({ data: added.map((l) => ({ orderId: id, ...l })) });
      await tx.order.update({
        where: { id },
        data: {
          status,
          scheduledDate: date ? SlotsService.dateKey(date) : null,
          slotId,
          addressId: addressId ?? null,
          collectionCenterId: centreId ?? null,
          labId,
          subtotal,
          discount,
          collectionFee,
          total,
          // What is still owed on top of a prepaid booking is only the door add-ons that remain.
          addOnTotal: kept.filter((i) => i.addOnId).reduce((s, i) => s + i.price, 0),
          ...(unassign
            ? {
                phlebotomistId: null,
                assignmentStatus: null,
                assignmentRejectedReason: null,
                onTheWayAt: null,
                reachedAt: null,
                collectionOtp: null,
                collectionOtpVerifiedAt: null,
              }
            : {}),
          statusLogs: {
            create: { status, note: ['Booking edited by admin: ' + summary, dto.note?.trim()].filter(Boolean).join(' — '), changedBy: adminEmail },
          },
        },
      });
    });

    await this.notifications.notifyUser(order.userId, {
      title: 'Your booking was updated',
      body: `Order ${order.orderNumber} — ${summary}`,
      data: { type: 'ORDER_STATUS', orderId: id, status },
    });
    if (order.phlebotomist) {
      await this.notifications.notifyPhlebotomistUser(order.phlebotomist.userId, {
        title: unassign ? 'Booking moved' : 'Booking updated',
        body: unassign
          ? `Order ${order.orderNumber} was rescheduled and removed from your list — it will be assigned again.`
          : `Order ${order.orderNumber} — ${summary}. Check the tests before you collect.`,
        data: { type: 'ASSIGNMENT', orderId: id, status: unassign ? 'REASSIGNED' : 'UPDATED' },
      });
      if (unassign) void this.sms.phlebotomistSms(order.phlebotomist.id, 'reassigned', id);
    }
    return { summary, unassigned: unassign };
  }
}
