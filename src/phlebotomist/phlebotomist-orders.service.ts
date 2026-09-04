import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { todayIstDateString } from '../common/ist-time.js';
import { toPhlebotomistStatusLabel } from './phlebotomist-status.js';

const ASSIGNMENT_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  scheduledDate: true,
  collectionType: true,
  reachedAt: true,
  user: { select: { name: true } },
  address: true,
  slot: true,
};

const BOOKING_DETAIL_INCLUDE = {
  user: { select: { name: true, phone: true } },
  address: true,
  collectionCenter: true,
  slot: true,
  items: { include: { familyMember: { select: { name: true, relation: true } } } },
};

@Injectable()
export class PhlebotomistOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * FSD §2.2 — "Today's Assignments (Dashboard)": all HOME-collection bookings assigned to the
   * authenticated phlebotomist, scheduled today (IST calendar day), sorted by scheduled time slot.
   * phlebotomistId always comes from the verified JWT payload — never from client input — so a
   * phlebotomist can only ever see their own assignments.
   */
  async listTodaysAssignments(phlebotomistId: string) {
    const todayStr = todayIstDateString();
    const startOfToday = new Date(todayStr);
    const endOfToday = new Date(startOfToday);
    endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: {
        phlebotomistId,
        collectionType: 'HOME',
        scheduledDate: { gte: startOfToday, lt: endOfToday },
      },
      select: ASSIGNMENT_LIST_SELECT,
      orderBy: { slot: { startTime: 'asc' } },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      patientName: o.user.name,
      address: o.address,
      scheduledDate: o.scheduledDate,
      slot: o.slot,
      status: o.status,
      phlebotomistStatus: toPhlebotomistStatusLabel(o.status),
      reachedAt: o.reachedAt,
    }));
  }

  /**
   * FSD §2.3 — "Booking Detail & Navigation". Authorization is the relationship check itself:
   * a booking not assigned to this phlebotomist is treated identically to a non-existent one
   * (404, not 403) — same convention as OrdersService.getOne()'s patient-ownership check.
   */
  async getAssignedBooking(phlebotomistId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: BOOKING_DETAIL_INCLUDE,
    });
    if (!order || order.phlebotomistId !== phlebotomistId) {
      throw new NotFoundException('Booking not found');
    }
    return { ...order, phlebotomistStatus: toPhlebotomistStatusLabel(order.status) };
  }

  /**
   * Shared ownership/eligibility check for phlebotomist status-update actions (FSD §2.4).
   * Same 404-for-not-mine convention as getAssignedBooking(); the HOME/CANCELLED rules are
   * BadRequestException since the booking genuinely IS theirs, just not in an eligible state.
   */
  private async requireEligibleHomeBooking(phlebotomistId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.phlebotomistId !== phlebotomistId) {
      throw new NotFoundException('Booking not found');
    }
    if (order.collectionType !== 'HOME') {
      throw new BadRequestException('Only home-collection bookings support this action');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('This booking is cancelled and can no longer be updated');
    }
    return order;
  }

  /**
   * FSD §2.4 — "Mark as 'Reached'". Deliberately does NOT touch Order.status (see the schema
   * comment on Order.reachedAt) and does NOT write an OrderStatusLog row — that model's `status`
   * column is the OrderStatus enum, which intentionally has no "Reached" value, and creating a
   * log entry with some other status just to carry a note would misrepresent the order's real
   * status history. reachedAt itself is the authoritative record of this event.
   */
  async markReached(phlebotomistId: string, orderId: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.reachedAt) {
      throw new BadRequestException('This booking has already been marked as reached');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { reachedAt: new Date() },
    });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Phlebotomist has arrived',
      body: `Order ${updated.orderNumber} — your phlebotomist has reached your location`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'REACHED' },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * FSD §2.4 — "Mark as 'Sample Collected' once the draw is complete". Uses the existing
   * SAMPLE_COLLECTED enum value as-is (no new status invented). Requires reachedAt to already be
   * set — FSD §2.4 lists Reached before Sample Collected as sequential steps — but otherwise no
   * preceding-status check: the existing admin status endpoint enforces no transition matrix
   * either (any status → any status), so this mirrors that same permissiveness rather than
   * inventing a broader restriction.
   */
  async markSampleCollected(phlebotomistId: string, orderId: string, phlebotomistPhone: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (!order.reachedAt) {
      throw new BadRequestException('This booking must be marked as reached before it can be marked as sample collected');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SAMPLE_COLLECTED',
        statusLogs: {
          create: {
            status: 'SAMPLE_COLLECTED',
            note: 'Sample collected by phlebotomist',
            changedBy: `PHLEBOTOMIST:${phlebotomistPhone}`,
          },
        },
      },
      include: { items: true, statusLogs: { orderBy: { createdAt: 'asc' } } },
    });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Sample collected',
      body: `Order ${updated.orderNumber} — your sample has been collected`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'SAMPLE_COLLECTED' },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * FSD §2.4 — "Collect Payment (if 'Pay at Collection' was selected) — Enter Amount Collected,
   * Payment Mode (Cash/UPI)... recorded against the Booking ID and reconciled by the Admin."
   *
   * Eligibility mirrors Reached/Sample Collected (ownership, HOME, not CANCELLED) plus two rules
   * specific to payment: the booking must be COD (this codebase's "Pay at Collection" — see the
   * checkout note "Booking confirmed — pay on collection"), and per the FSD's own sequence
   * (Reached → Sample Collected → Payment Collection) the sample must already be marked collected.
   * A single Prisma update() call keeps the write atomic — no partial state possible.
   */
  async markPaymentCollected(phlebotomistId: string, orderId: string, amount: number, paymentMode: 'CASH' | 'UPI') {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);

    if (order.paymentMethod !== 'COD') {
      throw new BadRequestException('This booking is not set up for pay-at-collection');
    }
    if (order.status !== 'SAMPLE_COLLECTED') {
      throw new BadRequestException('The sample must be marked collected before payment can be recorded');
    }
    if (order.collectedAmount !== null || order.collectionPaymentMode !== null) {
      throw new BadRequestException('Payment has already been recorded for this booking');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        collectedAmount: amount,
        collectionPaymentMode: paymentMode,
        collectedAt: new Date(),
        paymentStatus: 'PAID',
      },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * FSD §2.5 — "Scan/Enter Sample Barcode... Mark as 'Handed Over to Lab'... the patient's
   * tracking status automatically updates to 'In Lab'." Per approved decision, no payment
   * precondition is enforced (option b) — the only required prior state is SAMPLE_COLLECTED,
   * which also doubles as the duplicate-handover guard: once this call succeeds, status becomes
   * IN_LAB, so a second attempt fails this same check with no extra special-casing needed.
   * Unlike Reached/Payment, IN_LAB is a real, pre-existing OrderStatus value (already part of the
   * patient-facing timeline), so a genuine OrderStatusLog row is written — not a fake one.
   * Barcode + timestamp + status + log are written in a single Prisma update() call, so the
   * write is atomic; there is no path where only some of them apply.
   */
  async markHandedOver(phlebotomistId: string, orderId: string, sampleBarcode: string, phlebotomistPhone: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.status !== 'SAMPLE_COLLECTED') {
      throw new BadRequestException('This booking must be marked as sample collected before it can be handed over to the lab');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        sampleBarcode,
        handedOverAt: new Date(),
        status: 'IN_LAB',
        statusLogs: {
          create: {
            status: 'IN_LAB',
            note: 'Sample handed over to lab by phlebotomist',
            changedBy: `PHLEBOTOMIST:${phlebotomistPhone}`,
          },
        },
      },
      include: { items: true, statusLogs: { orderBy: { createdAt: 'asc' } } },
    });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Your sample is in the lab',
      body: `Order ${updated.orderNumber} — sample handed over for processing`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'IN_LAB' },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * FSD §2.6 — "Collection History": date-wise list of completed collections, total collections
   * completed, total cash/UPI collected. Read-only — no field on Order is written here.
   *
   * "Completed collection" = `handedOverAt IS NOT NULL` (and not CANCELLED). This is deliberately
   * NOT `collectedAt` (Phase 4's *payment*-collection timestamp): collectedAt is only ever set for
   * COD bookings, so using it would silently drop every ONLINE-paid booking from this phlebotomist's
   * history even though they physically completed those collections too. handedOverAt, by contrast,
   * is set once per booking regardless of payment method — it's the one timestamp that uniformly
   * marks "this phlebotomist finished this collection" (FSD §2.5's closing action), so it's used
   * both as the completion filter and as the date to group by. `status !== 'CANCELLED'` is kept as
   * an explicit extra guard so a booking cancelled sometime after handover can't misreport itself
   * as a completed collection just because handedOverAt happens to still be set.
   */
  async getCollectionHistory(phlebotomistId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        phlebotomistId,
        collectionType: 'HOME',
        status: { not: 'CANCELLED' },
        handedOverAt: { not: null },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        scheduledDate: true,
        slot: true,
        collectedAt: true,
        handedOverAt: true,
        collectedAmount: true,
        collectionPaymentMode: true,
        user: { select: { name: true } },
      },
      orderBy: { handedOverAt: 'desc' },
    });

    const groups = new Map<string, typeof orders>();
    for (const o of orders) {
      const dateKey = todayIstDateString(o.handedOverAt!);
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(o);
    }

    const cashTotal = (list: typeof orders) =>
      list.filter((o) => o.collectionPaymentMode === 'CASH').reduce((sum, o) => sum + (o.collectedAmount ?? 0), 0);
    const upiTotal = (list: typeof orders) =>
      list.filter((o) => o.collectionPaymentMode === 'UPI').reduce((sum, o) => sum + (o.collectedAmount ?? 0), 0);

    const history = Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, dayOrders]) => ({
        date,
        totalCollections: dayOrders.length,
        totalCashCollected: cashTotal(dayOrders),
        totalUpiCollected: upiTotal(dayOrders),
        collections: dayOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          patientName: o.user.name,
          scheduledDate: o.scheduledDate,
          slot: o.slot,
          collectedAt: o.collectedAt,
          handedOverAt: o.handedOverAt,
          collectedAmount: o.collectedAmount,
          collectionPaymentMode: o.collectionPaymentMode,
          status: o.status,
        })),
      }));

    return {
      summary: {
        totalCollections: orders.length,
        totalCashCollected: cashTotal(orders),
        totalUpiCollected: upiTotal(orders),
      },
      history,
    };
  }
}
