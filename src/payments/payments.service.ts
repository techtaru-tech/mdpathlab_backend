import { createHmac, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MailService } from '../mail/mail.service.js';
import { SmsService } from '../sms/sms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CheckoutSessionsService } from '../orders/checkout-sessions.service.js';

/** Razorpay's SDK rejects with a plain object ({ statusCode, error: { description } }), not an Error. */
function describeGatewayError(err: unknown): string {
  const e = err as { statusCode?: number; error?: { description?: string }; message?: string };
  return [e?.statusCode, e?.error?.description ?? e?.message ?? String(err)].filter(Boolean).join(' ');
}

/** Constant-time string comparison for signatures. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Injectable()
export class PaymentsService {
  private readonly gatewayLogger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly sessions: CheckoutSessionsService,
  ) {}

  /**
   * Keys are read fresh from the DB on every call (admin-configurable via the Settings panel,
   * with the .env values as a fallback for environments where they haven't been set yet) — a
   * cached client built once at boot could never pick up an admin's key change without a redeploy.
   */
  private async getKeys() {
    const settings = await this.settingsService.getOrCreate();
    return {
      keyId: settings.razorpayKeyId || this.config.get<string>('RAZORPAY_KEY_ID'),
      keySecret: settings.razorpayKeySecret || this.config.get<string>('RAZORPAY_KEY_SECRET'),
      webhookSecret: settings.razorpayWebhookSecret || this.config.get<string>('RAZORPAY_WEBHOOK_SECRET'),
    };
  }

  async createRazorpayOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== 'ONLINE') throw new BadRequestException('This order is not set up for online payment');
    if (order.paymentStatus === 'PAID') throw new BadRequestException('This order is already paid');
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and cannot be paid');

    const settings = await this.settingsService.getOrCreate();
    if (!settings.onlinePaymentEnabled) throw new BadRequestException('Online payment is currently unavailable');

    const { keyId, keySecret } = await this.getKeys();
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    // A gateway problem (wrong keys, website not approved, Razorpay down) must reach the customer as a clear
    // message, not a bare "Internal server error"; the real reason goes to the log.
    const rpOrder = await client.orders
      .create({
        amount: order.total * 100, // paise
        currency: 'INR',
        receipt: order.orderNumber,
      })
      .catch((err: unknown) => {
        this.gatewayLogger.error('Razorpay order create failed for ' + order.orderNumber + ': ' + describeGatewayError(err));
        throw new ServiceUnavailableException(
          'Online payment could not be started right now — please try again in a moment, or choose Pay after collection.',
        );
      });

    await this.prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rpOrder.id } });

    return {
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }

  async verifyPayment(
    userId: string,
    orderId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');

    // Idempotent — the webhook (source of truth) may have already confirmed this order by the
    // time the browser's own verify call lands.
    if (order.paymentStatus === 'PAID') return order;
    if (order.status === 'CANCELLED') throw new BadRequestException('This order is cancelled and cannot be paid');

    // The payment must be for the Razorpay order created for THIS order — a valid signature alone only proves
    // Razorpay saw some payment, which could belong to another order or a wallet top-up.
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) {
      throw new BadRequestException('This payment does not belong to this order');
    }

    const { keySecret } = await this.getKeys();
    if (!keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const expected = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (!safeEqual(expected, razorpaySignature)) {
      throw new BadRequestException('Payment signature verification failed');
    }

    return this.markPaid(order.id, razorpayOrderId, razorpayPaymentId, razorpaySignature);
  }

  private async markPaid(orderId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    let newlyPaid = false;
    const result = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (!fresh || fresh.paymentStatus === 'PAID') return fresh; // already settled by the other path

      // Money arrived for an order that was cancelled in the meantime: never revive it. Leave a note so the
      // payment is refunded by hand in Razorpay (once — webhooks are retried).
      if (fresh.status === 'CANCELLED') {
        const note = 'Payment ' + razorpayPaymentId + ' received after this order was cancelled — refund it in Razorpay';
        const logged = await tx.orderStatusLog.findFirst({ where: { orderId, note }, select: { id: true } });
        if (!logged) await tx.orderStatusLog.create({ data: { orderId, status: 'CANCELLED', note, changedBy: 'SYSTEM' } });
        return fresh;
      }

      // Only the call that really flips the order from unpaid to paid wins; a concurrent cancel or a second
      // payment path loses here instead of overwriting.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' } },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED', razorpayOrderId, razorpayPaymentId, razorpaySignature },
      });
      if (claimed.count !== 1) return tx.order.findUnique({ where: { id: orderId } });
      newlyPaid = true;
      return tx.order.update({
        where: { id: orderId },
        data: {
          statusLogs: { create: { status: 'CONFIRMED', note: 'Payment received', changedBy: 'SYSTEM' } },
        },
        // Same shape as OrdersService.getOne — the frontend treats every Order response as
        // fully populated, so a bare update() result (no relations) would silently drop items/
        // slot/address/etc. from the page until the next full reload.
        include: {
          items: { include: { familyMember: { select: { name: true, relation: true } } } },
          statusLogs: { orderBy: { createdAt: 'asc' } },
          slot: true,
          address: true,
          collectionCenter: true,
          phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
          reports: { where: { status: 'APPROVED' } },
          coupon: { select: { code: true } },
        },
      });
    });
    // Only the call that actually flipped the order to paid sends the email — the webhook and the
    // browser verify can both arrive, and the customer must get exactly one confirmation.
    if (newlyPaid && result) {
      void this.notifications.notifyUser(result.userId, {
        title: 'Payment received — booking confirmed',
        body: `Order ${result.orderNumber} — ₹${result.total} paid online`,
        data: { type: 'PAYMENT', orderId, status: 'PAID' },
      });
    }
    if (newlyPaid) {
      void this.mail.bookingConfirmedForOrder(orderId);
      void this.sms.bookingConfirmedForOrder(orderId);
      void this.mail.paymentReceiptForOrder(orderId);
    }
    return result;
  }

  /**
   * Razorpay webhook — trusted only through its signature (no Bearer token). Pay-first checkout sessions are
   * handled by CheckoutSessionsService; orders created the old way (order first, older app versions) keep their
   * existing handling below. Repeated deliveries of the same event are ignored by X-Razorpay-Event-Id.
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined, eventIdHeader: string | undefined) {
    const { webhookSecret } = await this.getKeys();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Razorpay webhook secret is not configured yet');
    }
    if (!signatureHeader) throw new BadRequestException('Missing webhook signature');

    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!safeEqual(expected, signatureHeader)) {
      this.gatewayLogger.warn('Security: webhook with an invalid signature rejected');
      throw new BadRequestException('Webhook signature verification failed');
    }

    const eventId = eventIdHeader?.slice(0, 100);
    if (eventId && (await this.prisma.razorpayWebhookEvent.findUnique({ where: { eventId } }))) {
      return { received: true, duplicate: true };
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload.event as string;
    await this.processEvent(event, payload);

    // Recorded only after it was handled, so a delivery that failed half-way is processed again on Razorpay's retry.
    if (eventId) {
      await this.prisma.razorpayWebhookEvent.create({ data: { eventId, event } }).catch((err: unknown) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      });
    }
    return { received: true };
  }

  private async processEvent(event: string, payload: any) {
    const paymentEntity = payload.payload?.payment?.entity;

    if (event === 'refund.processed') {
      const refund = payload.payload?.refund?.entity;
      if (!refund?.payment_id) return;
      if (await this.sessions.onRefundProcessed(refund.payment_id, refund.id)) return;
      await this.legacyRefundProcessed(refund.payment_id, Number(refund.amount ?? 0));
      return;
    }

    const razorpayOrderId = paymentEntity?.order_id ?? payload.payload?.order?.entity?.id;
    if (!razorpayOrderId) return;

    if (event === 'payment.captured' || event === 'order.paid') {
      if (paymentEntity?.id && (await this.sessions.onPaymentCaptured(razorpayOrderId, paymentEntity.id))) return;
    } else if (event === 'payment.failed') {
      if (await this.sessions.onPaymentFailed(razorpayOrderId, paymentEntity?.id, paymentEntity?.error_description)) return;
    }

    // ---- order-first (older app versions)
    const order = await this.prisma.order.findFirst({ where: { razorpayOrderId } });
    if (!order) return;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paidAmountRupees = Math.round((paymentEntity?.amount ?? 0) / 100);
      if (paidAmountRupees !== order.total) {
        // Amount mismatch — don't silently confirm; needs manual review.
        this.gatewayLogger.warn(`Security: webhook amount mismatch for order ${order.orderNumber}`);
        return;
      }
      await this.markPaid(order.id, razorpayOrderId, paymentEntity.id, '');
    } else if (event === 'payment.failed') {
      // Never downgrade an order that's already confirmed by the other path.
      if (order.paymentStatus !== 'PAID') {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'FAILED',
            statusLogs: { create: { status: order.status, note: 'Payment failed', changedBy: 'SYSTEM' } },
          },
        });
        await this.notifications.notifyUser(order.userId, {
          title: 'Payment failed',
          body: `Order ${order.orderNumber} — your payment did not go through. You can retry it from My Bookings.`,
          data: { type: 'PAYMENT', orderId: order.id, status: 'FAILED' },
        });
      }
    }
  }

  /** A refund made from the Razorpay dashboard on an order's payment: record it and tell the patient. */
  private async legacyRefundProcessed(paymentId: string, refundPaise: number) {
    const order = await this.prisma.order.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (!order || order.paymentStatus === 'REFUNDED') return;
    const full = refundPaise >= order.total * 100;
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        statusLogs: { create: { status: order.status, note: `Refund of ₹${refundPaise / 100} processed`, changedBy: 'SYSTEM' } },
      },
    });
    await this.notifications.notifyUser(order.userId, {
      title: 'Refund processed',
      body: `₹${(refundPaise / 100).toLocaleString('en-IN')} for order ${order.orderNumber} has been refunded to your original payment method.`,
      data: { type: 'PAYMENT', orderId: order.id, status: 'REFUNDED' },
    });
  }
}
