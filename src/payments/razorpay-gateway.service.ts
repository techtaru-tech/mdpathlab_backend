import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Razorpay's SDK rejects with a plain object ({ statusCode, error: { description } }), not an Error. */
export function describeGatewayError(err: unknown): string {
  const e = err as { statusCode?: number; error?: { description?: string }; message?: string };
  return [e?.statusCode, e?.error?.description ?? e?.message ?? String(err)].filter(Boolean).join(' ');
}

/** Constant-time string comparison for signatures. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type GatewayPayment = { id: string; order_id: string; amount: number; currency: string; status: string };

export type PaymentAuditEntry = {
  event: string;
  result: string;
  userId?: string | null;
  checkoutSessionId?: string | null;
  orderId?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  amount?: number | null;
  detail?: string | null;
};

/**
 * The one place the server talks to Razorpay for bookings. Keys are read fresh on every call (admin-configurable
 * in Settings, .env as the fallback) and never leave the server — only the public key id goes to the app.
 */
@Injectable()
export class RazorpayGateway {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async keys() {
    const s = await this.settings.getOrCreate();
    return {
      keyId: s.razorpayKeyId || this.config.get<string>('RAZORPAY_KEY_ID'),
      keySecret: s.razorpayKeySecret || this.config.get<string>('RAZORPAY_KEY_SECRET'),
      webhookSecret: s.razorpayWebhookSecret || this.config.get<string>('RAZORPAY_WEBHOOK_SECRET'),
    };
  }

  private async client() {
    const { keyId, keySecret } = await this.keys();
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Online payment is not available right now. Please choose Pay at collection.');
    return { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keyId, keySecret };
  }

  /** HMAC_SHA256(order_id|payment_id, key_secret), compared in constant time. */
  async signatureMatches(razorpayOrderId: string, razorpayPaymentId: string, signature: string) {
    const { keySecret } = await this.client();
    const expected = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    return safeEqual(expected, signature);
  }

  async createOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
    const { client, keyId } = await this.client();
    const order = await client.orders
      .create({ amount: amountPaise, currency: 'INR', receipt, notes, payment_capture: true })
      .catch((err: unknown) => {
        this.logger.error(`Razorpay order create failed for ${receipt}: ${describeGatewayError(err)}`);
        throw new ServiceUnavailableException('Online payment could not be started right now. Please try again in a moment, or choose Pay at collection.');
      });
    return { id: order.id, amount: Number(order.amount), currency: order.currency, keyId };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const { client } = await this.client();
    const p = await client.payments.fetch(paymentId);
    return { id: p.id, order_id: String(p.order_id), amount: Number(p.amount), currency: p.currency, status: p.status };
  }

  /** Captures an authorized payment (auto-capture normally does this; this covers accounts where it is off). */
  async capture(paymentId: string, amountPaise: number): Promise<GatewayPayment> {
    const { client } = await this.client();
    const p = await client.payments.capture(paymentId, amountPaise, 'INR');
    return { id: p.id, order_id: String(p.order_id), amount: Number(p.amount), currency: p.currency, status: p.status };
  }

  /** Every payment made against one Razorpay order — used by reconciliation to find captures we never heard about. */
  async orderPayments(razorpayOrderId: string): Promise<GatewayPayment[]> {
    const { client } = await this.client();
    const res = await client.orders.fetchPayments(razorpayOrderId);
    return (res.items ?? []).map((p) => ({ id: p.id, order_id: String(p.order_id), amount: Number(p.amount), currency: p.currency, status: p.status }));
  }

  /** Full refund to the original payment only. */
  async refund(paymentId: string, amountPaise: number, notes: Record<string, string>) {
    const { client } = await this.client();
    const r = await client.payments.refund(paymentId, { amount: amountPaise, speed: 'normal', notes });
    return { id: r.id, status: String(r.status) };
  }

  /** Never throws — an audit write must not break a payment. */
  async audit(entry: PaymentAuditEntry) {
    await this.prisma.paymentAuditLog
      .create({
        data: {
          event: entry.event,
          result: entry.result,
          userId: entry.userId ?? null,
          checkoutSessionId: entry.checkoutSessionId ?? null,
          orderId: entry.orderId ?? null,
          razorpayOrderId: entry.razorpayOrderId ?? null,
          razorpayPaymentId: entry.razorpayPaymentId ?? null,
          amount: entry.amount ?? null,
          detail: entry.detail?.slice(0, 500) ?? null,
        },
      })
      .catch((err: unknown) => this.logger.error('Payment audit write failed: ' + String(err)));
  }
}
