import { createHmac } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PaymentsService {
  private client: Razorpay | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (keyId && keySecret) {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  private requireClient() {
    if (!this.client) {
      throw new ServiceUnavailableException('Payment gateway is not configured yet');
    }
    return this.client;
  }

  async createRazorpayOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== 'ONLINE') throw new BadRequestException('This order is not set up for online payment');
    if (order.paymentStatus === 'PAID') throw new BadRequestException('This order is already paid');

    const client = this.requireClient();
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
      keyId: this.config.get<string>('RAZORPAY_KEY_ID'),
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

    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
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
    const webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
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
