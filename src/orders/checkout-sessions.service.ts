import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CheckoutSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RazorpayGateway, describeGatewayError } from '../payments/razorpay-gateway.service.js';
import { SlotsService } from '../slots/slots.service.js';
import { bookingFields, OrdersService, type BookingToCreate, type CheckoutLine } from './orders.service.js';
import type { CheckoutDto, CheckoutRequestDto } from './dto/checkout.dto.js';

const SESSION_MINUTES = 15;
const EXPIRE_EVERY_MS = 60_000;
const RECONCILE_EVERY_MS = 15 * 60_000;

/** What a session books — the validated request and the priced lines, saved when the payment was opened. */
type Snapshot = {
  request: {
    collectionType: 'HOME' | 'CENTER';
    addressId?: string | undefined;
    collectionCenterId?: string | undefined;
    slotId: string;
    scheduledDate: string;
    couponCode?: string | undefined;
    useWallet: boolean;
    prescriptionId?: string | undefined;
    fromCart: boolean;
  };
  booking: Omit<BookingToCreate, 'paymentMethod' | 'razorpay' | 'requireCart' | 'excludeSessionId' | 'note'>;
};

export type CompletionResult =
  | { kind: 'booked'; orderId: string; created: boolean }
  | { kind: 'refunded'; message: string };

const rupees = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');

/**
 * Pay first, then book. For "Pay online" with something left to pay, no Order exists until the money has been
 * received and checked here: the session holds the slot and the wallet amount for 15 minutes while the customer
 * pays, and exactly one Order is created from the session's own snapshot once the payment is verified — by the
 * app's call, the webhook or reconciliation, whichever comes first. A captured payment that can no longer be
 * booked is refunded in full.
 */
@Injectable()
export class CheckoutSessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Checkout');
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly gateway: RazorpayGateway,
    private readonly notifications: NotificationsService,
    private readonly slots: SlotsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = (fn: () => Promise<unknown>, name: string) => () =>
      void fn().catch((err: unknown) => this.logger.error(`${name} failed: ${String(err)}`));
    this.timers.push(setInterval(run(() => this.expireStale(), 'Expire sessions'), EXPIRE_EVERY_MS));
    this.timers.push(setInterval(run(() => this.reconcile(), 'Reconciliation'), RECONCILE_EVERY_MS));
    for (const t of this.timers) t.unref();
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
  }

  // ---------------------------------------------------------------- step 1: open the payment

  async createRazorpayOrder(userId: string, dto: CheckoutRequestDto) {
    const { fromCart, lines, priced } = await this.orders.prepareCheckout(userId, dto, 'ONLINE');
    if (priced.total <= 0) throw new BadRequestException('Nothing to pay. Book with wallet.');

    const snapshot: Snapshot = {
      request: {
        collectionType: dto.collectionType,
        addressId: dto.addressId,
        collectionCenterId: dto.collectionCenterId,
        slotId: dto.slotId,
        scheduledDate: dto.scheduledDate,
        couponCode: dto.couponCode ? dto.couponCode.trim().toUpperCase() : undefined,
        useWallet: Boolean(dto.useWallet),
        prescriptionId: dto.prescriptionId,
        fromCart,
      },
      booking: bookingFields(dto, priced, lines),
    };
    const amount = priced.total * 100;

    // Hold the slot (and the wallet amount) for this session. The capacity check runs under the same lock as a
    // real booking, so the last place can't be handed to two people paying at the same time.
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'checkout:' + userId}, 0))`;
      // A new "Pay & Book" replaces any earlier unfinished one, so a patient never holds two places at once. If the
      // earlier payment still goes through, it is booked (or refunded) from that session as usual.
      await tx.checkoutSession.updateMany({ where: { userId, status: 'PENDING' }, data: { status: 'EXPIRED', failureReason: 'Replaced by a newer checkout' } });
      await this.slots.reserveCapacityOrThrow(tx, dto.slotId, dto.scheduledDate, dto.collectionType, dto.collectionCenterId);
      return tx.checkoutSession.create({
        data: {
          userId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          amount,
          walletHold: priced.walletUsed * 100,
          slotId: dto.slotId,
          scheduledDate: new Date(`${dto.scheduledDate}T00:00:00.000Z`),
          collectionType: dto.collectionType,
          collectionCenterId: dto.collectionCenterId ?? null,
          expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
        },
      });
    });

    let rp: Awaited<ReturnType<RazorpayGateway['createOrder']>>;
    try {
      // No personal details in notes — only our own id.
      rp = await this.gateway.createOrder(amount, session.id, { checkoutSessionId: session.id });
    } catch (err) {
      await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { status: 'FAILED', failureReason: 'Razorpay order could not be created' } });
      await this.gateway.audit({ event: 'session.create', result: 'gateway_error', userId, checkoutSessionId: session.id, amount });
      throw err;
    }
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { razorpayOrderId: rp.id } });
    await this.gateway.audit({ event: 'session.create', result: 'ok', userId, checkoutSessionId: session.id, razorpayOrderId: rp.id, amount });

    return { orderId: rp.id, amount: rp.amount, currency: rp.currency, keyId: rp.keyId, expiresAt: session.expiresAt.toISOString() };
  }

  // ---------------------------------------------------------------- step 3: the app sends the payment proof

  async checkoutWithProof(userId: string, dto: CheckoutDto): Promise<{ order: unknown; created: boolean }> {
    const razorpayOrderId = dto.razorpay_order_id!;
    const paymentId = dto.razorpay_payment_id;
    const signature = dto.razorpay_signature;
    if (!paymentId || !signature) throw new BadRequestException('Payment could not be verified. If money was deducted, it will be refunded.');

    const session = await this.prisma.checkoutSession.findUnique({ where: { razorpayOrderId } });
    if (!session) throw new NotFoundException('This payment session was not found. If money was deducted, it will be refunded.');
    if (session.userId !== userId) {
      await this.gateway.audit({ event: 'checkout.proof', result: 'wrong_user', userId, checkoutSessionId: session.id, razorpayOrderId, razorpayPaymentId: paymentId });
      throw new ForbiddenException('This booking is not available.');
    }
    if (session.status === 'COMPLETED' && session.orderId) {
      return { order: await this.orders.getOne(userId, session.orderId), created: false };
    }
    const mismatch = this.differsFromSnapshot(session, dto);
    if (mismatch) {
      await this.gateway.audit({ event: 'checkout.proof', result: 'body_mismatch', userId, checkoutSessionId: session.id, razorpayOrderId, detail: mismatch });
      throw new ConflictException('Your booking details changed while paying. Please go back and try again. If money was deducted, it will be refunded.');
    }

    if (!(await this.gateway.signatureMatches(razorpayOrderId, paymentId, signature))) {
      this.logger.warn(`Security: invalid payment signature for session ${session.id}`);
      await this.gateway.audit({ event: 'checkout.proof', result: 'bad_signature', userId, checkoutSessionId: session.id, razorpayOrderId, razorpayPaymentId: paymentId });
      throw new BadRequestException('Payment could not be verified. If money was deducted, it will be refunded.');
    }

    const result = await this.complete(session, paymentId, signature, 'app');
    if (result.kind === 'refunded') throw new ConflictException({ statusCode: 409, message: result.message, refunded: true });
    return { order: await this.orders.getOne(userId, result.orderId), created: result.created };
  }

  /** The proof call must book what was priced: the same items, slot, date and coupon (when the body names them). */
  private differsFromSnapshot(session: CheckoutSession, dto: CheckoutRequestDto): string | null {
    const snap = session.snapshot as unknown as Snapshot;
    const r = snap.request;
    if (dto.slotId !== r.slotId) return 'slotId';
    if (dto.scheduledDate !== r.scheduledDate) return 'scheduledDate';
    if (dto.collectionType !== r.collectionType) return 'collectionType';
    if ((dto.addressId ?? null) !== (r.addressId ?? null)) return 'addressId';
    if ((dto.collectionCenterId ?? null) !== (r.collectionCenterId ?? null)) return 'collectionCenterId';
    if ((dto.couponCode?.trim().toUpperCase() || null) !== (r.couponCode ?? null)) return 'couponCode';
    if (Boolean(dto.useWallet) !== r.useWallet) return 'useWallet';
    if (dto.items?.length) {
      // What gets booked always comes from the snapshot; this only catches a different cart being sent. Items may
      // be sent by slug, so they are compared by type, patient and count.
      const key = (i: { itemType: string; familyMemberId?: string | null }) => `${i.itemType}:${i.familyMemberId ?? ''}`;
      if (dto.items.map(key).sort().join('|') !== snap.booking.lines.map(key).sort().join('|')) return 'items';
    }
    return null;
  }

  // ---------------------------------------------------------------- booking from a verified payment

  /**
   * Checks the payment against Razorpay's own record and books the session — exactly once, whoever calls first
   * (app, webhook, reconciliation). If the booking can no longer be made, the payment is refunded in full.
   */
  async complete(session: CheckoutSession, paymentId: string, signature: string | null, source: 'app' | 'webhook' | 'reconcile'): Promise<CompletionResult> {
    if (session.status === 'COMPLETED' && session.orderId) return { kind: 'booked', orderId: session.orderId, created: false };
    if (session.status === 'REFUNDED') return { kind: 'refunded', message: this.refundMessage(session.amount, session.failureReason) };

    // Second check: Razorpay's own record of the money (status, amount, order, currency).
    let payment = await this.gateway.fetchPayment(paymentId);
    if (payment.order_id !== session.razorpayOrderId || payment.currency !== 'INR' || payment.amount !== session.amount) {
      this.logger.warn(`Security: payment ${paymentId} does not match session ${session.id}`);
      await this.gateway.audit({
        event: `complete.${source}`,
        result: 'payment_mismatch',
        userId: session.userId,
        checkoutSessionId: session.id,
        razorpayOrderId: session.razorpayOrderId,
        razorpayPaymentId: paymentId,
        amount: payment.amount,
      });
      throw new BadRequestException('Payment could not be verified. If money was deducted, it will be refunded.');
    }
    if (payment.status === 'authorized') payment = await this.gateway.capture(paymentId, session.amount);
    if (payment.status !== 'captured') {
      await this.gateway.audit({ event: `complete.${source}`, result: `not_captured:${payment.status}`, userId: session.userId, checkoutSessionId: session.id, razorpayPaymentId: paymentId, amount: payment.amount });
      throw new BadRequestException('Your payment has not been completed yet. If money was deducted, it will be refunded.');
    }

    const snap = session.snapshot as unknown as Snapshot;
    let orderId: string;
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Row lock: the app call, the webhook and reconciliation queue up here; only the first one books.
        await tx.$queryRaw`SELECT id FROM checkout_sessions WHERE id = ${session.id} FOR UPDATE`;
        const fresh = await tx.checkoutSession.findUniqueOrThrow({ where: { id: session.id } });
        if (fresh.status === 'COMPLETED' && fresh.orderId) return { done: fresh.orderId };
        if (fresh.status === 'REFUNDED') return { refunded: true as const };

        const order = await this.orders.createOrderInTx(tx, session.userId, {
          ...snap.booking,
          lines: snap.booking.lines as CheckoutLine[],
          paymentMethod: 'ONLINE',
          razorpay: { orderId: session.razorpayOrderId!, paymentId, signature },
          requireCart: false,
          excludeSessionId: session.id,
          note: 'Booking confirmed — paid online',
        });
        await tx.checkoutSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', orderId: order.id, razorpayPaymentId: paymentId },
        });
        return { created: order.id };
      });
      if ('refunded' in outcome) return { kind: 'refunded', message: this.refundMessage(session.amount, session.failureReason) };
      if ('done' in outcome) return { kind: 'booked', orderId: outcome.done!, created: false };
      orderId = outcome.created;
    } catch (err) {
      // Another path booked this payment a moment ago (unique razorpayPaymentId) — that booking stands.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.checkoutSession.findUnique({ where: { id: session.id } });
        if (again?.status === 'COMPLETED' && again.orderId) return { kind: 'booked', orderId: again.orderId, created: false };
        throw err;
      }
      // The booking itself can't be made any more (slot gone, coupon used up, wallet spent...): refund it.
      if (err instanceof HttpException && err.getStatus() < 500) {
        return this.refundSession(session, paymentId, err.message, source);
      }
      throw err;
    }

    await this.gateway.audit({
      event: `complete.${source}`,
      result: 'booked',
      userId: session.userId,
      checkoutSessionId: session.id,
      orderId,
      razorpayOrderId: session.razorpayOrderId,
      razorpayPaymentId: paymentId,
      amount: session.amount,
    });
    await this.orders.announceNewOrder(orderId, 'ONLINE');
    return { kind: 'booked', orderId, created: true };
  }

  private refundMessage(amountPaise: number, reason: string | null) {
    const why = reason && /slot|fully booked/i.test(reason) ? 'Your slot was taken while paying.' : 'This booking could not be completed.';
    return `${why} ${rupees(amountPaise)} has been refunded to your account.`;
  }

  /** Full refund to the original payment. The session is claimed first, so only one caller ever refunds. */
  private async refundSession(session: CheckoutSession, paymentId: string, reason: string, source: string): Promise<CompletionResult> {
    const claimed = await this.prisma.checkoutSession.updateMany({
      where: { id: session.id, status: { in: ['PENDING', 'EXPIRED', 'FAILED'] } },
      data: { status: 'REFUNDED', razorpayPaymentId: paymentId, failureReason: reason.slice(0, 300) },
    });
    if (claimed.count === 0) {
      const again = await this.prisma.checkoutSession.findUnique({ where: { id: session.id } });
      if (again?.status === 'COMPLETED' && again.orderId) return { kind: 'booked', orderId: again.orderId, created: false };
      return { kind: 'refunded', message: this.refundMessage(session.amount, again?.failureReason ?? reason) };
    }

    let refundId: string | null = null;
    let refundStatus = 'REQUESTED';
    try {
      const refund = await this.gateway.refund(paymentId, session.amount, { checkoutSessionId: session.id, reason: 'booking_not_possible' });
      refundId = refund.id;
      refundStatus = refund.status.toUpperCase();
    } catch (err) {
      refundStatus = 'FAILED';
      this.logger.error(`Refund failed for payment ${paymentId} (session ${session.id}): ${describeGatewayError(err)}`);
      await this.notifications.notifyAdmins({
        title: 'Refund needs attention',
        body: `Automatic refund of ${rupees(session.amount)} failed for payment ${paymentId}. Refund it from the Razorpay dashboard.`,
        data: { type: 'PAYMENT_REFUND_FAILED', checkoutSessionId: session.id },
      });
    }
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { razorpayRefundId: refundId, refundStatus } });
    await this.gateway.audit({
      event: `refund.${source}`,
      result: refundStatus,
      userId: session.userId,
      checkoutSessionId: session.id,
      razorpayOrderId: session.razorpayOrderId,
      razorpayPaymentId: paymentId,
      amount: session.amount,
      detail: reason,
    });
    const message = this.refundMessage(session.amount, reason);
    await this.notifications.notifyUser(session.userId, {
      title: 'Payment refunded',
      body: `${message} It usually reaches your account in 5–7 working days.`,
      data: { type: 'PAYMENT', status: 'REFUNDED', checkoutSessionId: session.id },
    });
    return { kind: 'refunded', message };
  }

  // ---------------------------------------------------------------- webhook events

  /** payment.captured / order.paid. Returns false when the Razorpay order is not a checkout session. */
  async onPaymentCaptured(razorpayOrderId: string, paymentId: string): Promise<boolean> {
    const session = await this.prisma.checkoutSession.findUnique({ where: { razorpayOrderId } });
    if (!session) return false;
    await this.complete(session, paymentId, null, 'webhook');
    return true;
  }

  /** payment.failed: nothing booked; the holds are released (unless a payment was captured meanwhile). */
  async onPaymentFailed(razorpayOrderId: string, paymentId: string, reason: string | undefined): Promise<boolean> {
    const session = await this.prisma.checkoutSession.findUnique({ where: { razorpayOrderId } });
    if (!session) return false;
    const updated = await this.prisma.checkoutSession.updateMany({
      where: { id: session.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: (reason ?? 'Payment failed').slice(0, 300) },
    });
    await this.gateway.audit({ event: 'webhook.payment.failed', result: updated.count ? 'session_failed' : 'ignored', userId: session.userId, checkoutSessionId: session.id, razorpayPaymentId: paymentId, amount: session.amount });
    if (updated.count) {
      await this.notifications.notifyUser(session.userId, {
        title: 'Payment failed',
        body: 'Your payment did not go through and nothing was booked. Your cart is saved — you can try again.',
        data: { type: 'PAYMENT', status: 'FAILED', checkoutSessionId: session.id },
      });
    }
    return true;
  }

  /** refund.processed for a session refund. Returns false when the payment is not a session's. */
  async onRefundProcessed(paymentId: string, refundId: string): Promise<boolean> {
    const session = await this.prisma.checkoutSession.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (!session) return false;
    if (session.refundStatus === 'PROCESSED') return true;
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { refundStatus: 'PROCESSED', razorpayRefundId: session.razorpayRefundId ?? refundId } });
    await this.gateway.audit({ event: 'webhook.refund.processed', result: 'ok', userId: session.userId, checkoutSessionId: session.id, razorpayPaymentId: paymentId, amount: session.amount });
    await this.notifications.notifyUser(session.userId, {
      title: 'Refund processed',
      body: `${rupees(session.amount)} has been refunded to your original payment method.`,
      data: { type: 'PAYMENT', status: 'REFUNDED', checkoutSessionId: session.id },
    });
    return true;
  }

  // ---------------------------------------------------------------- jobs

  /** Every minute: unpaid sessions past their 15 minutes expire. (Holds already stop counting at expiresAt.) */
  async expireStale() {
    const r = await this.prisma.checkoutSession.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return r.count;
  }

  /**
   * Every 15 minutes: asks Razorpay about recent sessions that were never booked. A captured payment is booked, or
   * refunded if that is no longer possible — this catches webhooks that never arrived.
   */
  async reconcile() {
    const sessions = await this.prisma.checkoutSession.findMany({
      where: {
        status: { in: ['PENDING', 'EXPIRED', 'FAILED'] },
        razorpayOrderId: { not: null },
        createdAt: { gt: new Date(Date.now() - 48 * 3600_000) },
        updatedAt: { lt: new Date(Date.now() - 2 * 60_000) }, // leave sessions being paid right now alone
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let handled = 0;
    for (const s of sessions) {
      try {
        const payments = await this.gateway.orderPayments(s.razorpayOrderId!);
        const paid = payments.find((p) => p.status === 'captured') ?? payments.find((p) => p.status === 'authorized');
        if (!paid) continue;
        await this.complete(s, paid.id, null, 'reconcile');
        handled++;
      } catch (err) {
        this.logger.error(`Reconciliation of session ${s.id} failed: ${describeGatewayError(err)}`);
      }
    }
    return handled;
  }
}
