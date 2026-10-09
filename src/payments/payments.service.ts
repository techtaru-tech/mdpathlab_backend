import { createHmac, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MailService } from '../mail/mail.service.js';
import { SmsService } from '../sms/sms.service.js';

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
    if (newlyPaid) {
      void this.mail.bookingConfirmedForOrder(orderId);
      void this.sms.bookingConfirmedForOrder(orderId);
      void this.mail.paymentReceiptForOrder(orderId);
    }
    return result;
  }

  /** Webhook is the real source of truth — browser-side verify is just a faster path for UX. */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    const { webhookSecret } = await this.getKeys();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Razorpay webhook secret is not configured yet');
    }
    if (!signatureHeader) throw new BadRequestException('Missing webhook signature');

    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!safeEqual(expected, signatureHeader)) {
      throw new BadRequestException('Webhook signature verification failed');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload.event as string;
    const paymentEntity = payload.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    if (!razorpayOrderId) return { received: true };

    const order = await this.prisma.order.findFirst({ where: { razorpayOrderId } });
    if (!order) return { received: true };

    if (event === 'payment.captured' || event === 'order.paid') {
      const paidAmountRupees = Math.round((paymentEntity.amount ?? 0) / 100);
      if (paidAmountRupees !== order.total) {
        // Amount mismatch — don't silently confirm; needs manual review.
        return { received: true, flagged: 'amount_mismatch' };
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
      }
    }

    return { received: true };
  }
}
