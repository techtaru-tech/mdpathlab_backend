import { createHmac } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
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

    const settings = await this.settingsService.getOrCreate();
    if (!settings.onlinePaymentEnabled) throw new BadRequestException('Online payment is currently unavailable');

    const { keyId, keySecret } = await this.getKeys();
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rpOrder = await client.orders.create({
      amount: order.total * 100, // paise
      currency: 'INR',
      receipt: order.orderNumber,
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

    const { keySecret } = await this.getKeys();
    if (!keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const expected = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expected !== razorpaySignature) {
      throw new BadRequestException('Payment signature verification failed');
    }

    return this.markPaid(order.id, razorpayOrderId, razorpayPaymentId, razorpaySignature);
  }

  private async markPaid(orderId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (!fresh || fresh.paymentStatus === 'PAID') return fresh; // already settled by the other path
      return tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
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
  }

  /** Webhook is the real source of truth — browser-side verify is just a faster path for UX. */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    const { webhookSecret } = await this.getKeys();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Razorpay webhook secret is not configured yet');
    }
    if (!signatureHeader) throw new BadRequestException('Missing webhook signature');

    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expected !== signatureHeader) {
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
