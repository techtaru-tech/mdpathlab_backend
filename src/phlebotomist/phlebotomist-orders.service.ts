import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { SmsService } from '../sms/sms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { todayIstDateString } from '../common/ist-time.js';
import { toPhlebotomistStatusLabel } from './phlebotomist-status.js';

const ASSIGNMENT_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  scheduledDate: true,
  collectionType: true,
  assignmentStatus: true,
  onTheWayAt: true,
  reachedAt: true,
  collectionOtpVerifiedAt: true,
  handedOverAt: true,
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
  addOns: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class PhlebotomistOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
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
      assignmentStatus: o.assignmentStatus,
      onTheWayAt: o.onTheWayAt,
      reachedAt: o.reachedAt,
      collectionOtpVerifiedAt: o.collectionOtpVerifiedAt,
      handedOverAt: o.handedOverAt,
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

    // 4-digit, generated fresh each time reached is marked — collides with nothing else in the
    // system, plain-text is fine here since it's a one-time doorstep check, not a credential.
    const code = String(Math.floor(1000 + Math.random() * 9000));

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { reachedAt: new Date(), collectionOtp: code },
    });
    void this.sms.orderSms(orderId, 'sampleOtp', { code });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Phlebotomist has arrived',
      body: `Order ${updated.orderNumber} — share this code with your phlebotomist: ${code}`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'REACHED' },
    });

    // No devEcho here (unlike login OTP) — the code is meant to verify the phlebotomist's own
    // identity to the patient, so handing it back in the phlebotomist's own API response would
    // defeat the entire point. The push notification above is its only delivery path.
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
    if (!order.collectionOtpVerifiedAt) {
      throw new BadRequestException('Verify the patient’s code before marking the sample collected');
    }
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, include: { sample: true } });
    const incomplete = items.filter((i) => !i.sample?.collectedAt);
    if (incomplete.length > 0) {
      throw new BadRequestException(
        `Mark every required sample collected first — missing: ${incomplete.map((i) => i.itemName).join(', ')}`,
      );
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

    // A booking already paid online/by wallet only owes what was added at the door (Order.addOnTotal).
    const owesAddOnOnly = order.paymentMethod !== 'COD' && order.addOnTotal > 0;
    if (order.paymentMethod !== 'COD' && !owesAddOnOnly) {
      throw new BadRequestException('This booking is not set up for pay-at-collection');
    }
    if (owesAddOnOnly && amount !== order.addOnTotal) {
      throw new BadRequestException(`Collect exactly ₹${order.addOnTotal} — the amount for the tests added at the door`);
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
    // Fire-and-forget: MailService never throws, and email must never slow this response.
    void this.mail.paymentReceiptForOrder(orderId);

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * FSD §2.5 — "Scan/Enter Sample Barcode... Mark as 'Handed Over to Lab'." Updated from the
   * original design: this no longer flips status to IN_LAB itself — the lab now separately
   * acknowledges actual receipt (LabOrdersService.receiveSample), which is what drives IN_LAB.
   * handedOverAt stays the phlebotomist's own record of "I dropped it off," now distinct from the
   * lab's own "we got it." Only required prior state is SAMPLE_COLLECTED; a second attempt fails
   * on the handedOverAt-already-set guard below.
   */
  async markHandedOver(phlebotomistId: string, orderId: string, sampleBarcode: string, phlebotomistPhone: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.status !== 'SAMPLE_COLLECTED') {
      throw new BadRequestException('This booking must be marked as sample collected before it can be handed over to the lab');
    }
    if (order.handedOverAt) {
      throw new BadRequestException('This booking has already been handed over to the lab');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { sampleBarcode, handedOverAt: new Date() },
      include: { items: true, statusLogs: { orderBy: { createdAt: 'asc' } } },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /** FSD §2.3 extension — accept/reject an assignment before doing anything else with it. */
  async acceptAssignment(phlebotomistId: string, orderId: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.assignmentStatus !== 'PENDING') {
      throw new BadRequestException('This assignment has already been responded to');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignmentStatus: 'ACCEPTED' },
    });

    await this.notifications.notifyUser(updated.userId, {
      title: 'Phlebotomist assigned',
      body: `Order ${updated.orderNumber} — your phlebotomist has accepted this booking`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'PHLEBOTOMIST_ASSIGNED' },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  // Rejecting unassigns the phlebotomist entirely (rather than leaving a dead REJECTED
  // assignment sitting on the order) so the booking immediately reappears as unassigned in the
  // lab's dashboard for reassignment — the lab's own multi-lab-marketplace tooling already knows
  // how to show/handle an unassigned HOME booking.
  async rejectAssignment(phlebotomistId: string, orderId: string, reason: string | undefined, phlebotomistPhone: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.assignmentStatus !== 'PENDING') {
      throw new BadRequestException('This assignment has already been responded to');
    }

    // With nobody assigned any more, "Phlebotomist assigned" would be false — move it back to
    // CONFIRMED (the existing "awaiting assignment" status) so the lab/admin see it as needing
    // reassignment. Nothing else on the booking (patient, address, items, slot) is touched.
    const backToPending = order.status === 'PHLEBOTOMIST_ASSIGNED';
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        phlebotomistId: null,
        assignmentStatus: null,
        assignmentRejectedReason: reason ?? null,
        ...(backToPending
          ? {
              status: 'CONFIRMED',
              statusLogs: {
                create: {
                  status: 'CONFIRMED',
                  note: `Phlebotomist declined — assignment pending${reason ? ` (${reason})` : ''}`,
                  changedBy: `PHLEBOTOMIST:${phlebotomistPhone}`,
                },
              },
            }
          : {}),
      },
    });

    return { ok: true };
  }

  async markOnTheWay(phlebotomistId: string, orderId: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (order.assignmentStatus !== 'ACCEPTED') {
      throw new BadRequestException('Accept this assignment before marking on the way');
    }
    if (order.onTheWayAt) {
      throw new BadRequestException('This booking has already been marked as on the way');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { onTheWayAt: new Date() },
    });
    void this.sms.orderSms(orderId, 'onTheWay');

    await this.notifications.notifyUser(updated.userId, {
      title: 'Phlebotomist is on the way',
      body: `Order ${updated.orderNumber} — your phlebotomist is heading to your location`,
      data: { type: 'ORDER_STATUS', orderId: updated.id, status: 'ON_THE_WAY' },
    });

    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  /**
   * Doorstep identity check — a short code sent to the patient (dev-echoed here the same way the
   * login OTP is, since there's no real SMS gateway) that the phlebotomist reads back and enters
   * into their app before starting collection.
   */
  async verifyCollectionOtp(phlebotomistId: string, orderId: string, code: string) {
    const order = await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    if (!order.collectionOtp) {
      throw new BadRequestException('No verification code has been generated for this booking yet — mark as reached first');
    }
    if (order.collectionOtpVerifiedAt) {
      throw new BadRequestException('This booking has already been verified');
    }
    if (order.collectionOtp !== code) {
      throw new BadRequestException('Incorrect verification code');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { collectionOtpVerifiedAt: new Date() },
    });
    return { ...updated, phlebotomistStatus: toPhlebotomistStatusLabel(updated.status) };
  }

  // Auto-creates one OrderSample row per line item the first time they're read — items added at
  // checkout never have one yet, and this is simpler than backfilling on order creation for a
  // detail a phlebotomist only ever needs at the point of actually collecting.
  async listSamples(phlebotomistId: string, orderId: string) {
    await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, include: { sample: true } });

    await Promise.all(
      items.filter((i) => !i.sample).map((i) => this.prisma.orderSample.create({ data: { orderItemId: i.id } })),
    );

    const refreshed = await this.prisma.orderItem.findMany({ where: { orderId }, include: { sample: true } });
    return refreshed.map((i) => ({
      orderItemId: i.id,
      itemName: i.itemName,
      sample: i.sample,
    }));
  }

  async updateSample(
    phlebotomistId: string,
    orderId: string,
    orderItemId: string,
    dto: { tubeType?: string; quantity?: string; label?: string; collected?: boolean },
  ) {
    await this.requireEligibleHomeBooking(phlebotomistId, orderId);
    const item = await this.prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item || item.orderId !== orderId) throw new NotFoundException('Sample not found');

    return this.prisma.orderSample.upsert({
      where: { orderItemId },
      create: {
        orderItemId,
        ...(dto.tubeType !== undefined ? { tubeType: dto.tubeType } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.collected ? { collectedAt: new Date() } : {}),
      },
      update: {
        ...(dto.tubeType !== undefined ? { tubeType: dto.tubeType } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.collected !== undefined ? { collectedAt: dto.collected ? new Date() : null } : {}),
      },
    });
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
  /**
   * A self-reported GPS ping — updates the phlebotomist's single "current position" pointer
   * (Phlebotomist.lastLat/lastLng/lastLocationAt, not a history table — see the schema comment).
   * No booking-ownership check needed here: this isn't scoped to any one order, it's just "where
   * is this phlebotomist right now," which OrdersService.getTracking() reads for whichever of
   * their bookings a customer happens to be viewing.
   */
  async updateLocation(phlebotomistId: string, lat: number, lng: number) {
    await this.prisma.phlebotomist.update({
      where: { id: phlebotomistId },
      data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
    });
    return { ok: true };
  }

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
