import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

// The exact text registered on DLT for the OTP template (DLT Content Id in SMS_OTP_DLT_CONTENT_ID),
// with {#var#} replaced by the code. Operators reject any SMS whose text differs from the approved
// template — even by a comma — so this must stay byte-for-byte identical to what DLT approved.
const OTP_TEMPLATE = 'MD PATH LAB - Your login OTP is {#var#}\nLogin for your Good Health.';

// Order SMS templates. Each text must stay byte-for-byte what was approved on DLT, and its Content Id is read
// from the env key shown. {#var#} slots are filled in order. An event whose Content Id is not set is skipped.
export type OrderSmsKind = 'bookingConfirmed' | 'sampleOtp' | 'phleboAssigned' | 'onTheWay' | 'reportReady' | 'bookingCancelled';
const ORDER_SMS: Record<OrderSmsKind, { env: string; text: string }> = {
  bookingConfirmed: { env: 'SMS_BOOKING_DLT_CONTENT_ID', text: 'MD PATH LAB - Your test is booked with ID no. {#var#} Our team will contact you soon for sample collection.' },
  sampleOtp: { env: 'SMS_SAMPLE_OTP_DLT_CONTENT_ID', text: 'MD PATH LAB - Your sample collection OTP is {#var#}. Share it with the phlebotomist only at the time of collection.' },
  phleboAssigned: { env: 'SMS_PHLEBO_ASSIGNED_DLT_CONTENT_ID', text: 'MD PATH LAB - Phlebotomist {#var#} is assigned to your booking {#var#}. Our team will contact you soon.' },
  onTheWay: { env: 'SMS_ON_THE_WAY_DLT_CONTENT_ID', text: 'MD PATH LAB - Your phlebotomist is on the way for booking {#var#}. Please keep your sample collection details ready.' },
  reportReady: { env: 'SMS_REPORT_READY_DLT_CONTENT_ID', text: 'MD PATH LAB - Your report for booking {#var#} is ready. Please log in to the app or website to view and download it.' },
  bookingCancelled: { env: 'SMS_CANCELLED_DLT_CONTENT_ID', text: 'MD PATH LAB - Your booking {#var#} has been cancelled. For any help call {#var#}.' },
};
// The sample-OTP / assigned / on-the-way / report-ready / cancelled templates are registered under the
// MDPLBS header (the login OTP and booking-confirmed ones under MDLAB). Override with SMS_ORDER_SENDER_ID.
const ORDER_SENDER_DEFAULT = 'MDPLBS';

// One DLT variable holds at most 40 characters.
const fit = (value: string) => value.trim().slice(0, 40);

// Documented error codes from the provider's HTTP API guide (HTTP_SMS_API.pdf).
const PROVIDER_ERRORS: Record<number, string> = {
  2051: 'Sender ID is not registered on the SMS panel',
  2054: 'Invalid mobile number',
  2070: 'SMS panel authentication failed (username/password)',
  6001: 'SMS balance exhausted',
  7001: 'DLT Content Id missing',
};

export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly providerStatusCode?: number,
  ) {
    super(message);
  }
}

type ProviderResponse = { transactionId?: number; state?: string; statusCode?: number; description?: string };

/**
 * Sends DLT-registered SMS through the Kanpur City Online HTTP API (GET /fe/api/v1/send).
 * Disabled — isConfigured() false — until the API username/password are set, so local development
 * keeps working without a gateway.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMS_API_BASE_URL') &&
        this.config.get<string>('SMS_API_USERNAME') &&
        this.config.get<string>('SMS_API_PASSWORD') &&
        this.config.get<string>('SMS_SENDER_ID'),
    );
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const contentId = this.config.get<string>('SMS_OTP_DLT_CONTENT_ID');
    if (!contentId) throw new SmsSendError('SMS_OTP_DLT_CONTENT_ID is not set');
    await this.send(phone, OTP_TEMPLATE.replace('{#var#}', code), contentId);
  }

  /**
   * SMS about an order, built from the stored order. Best-effort and never throws: a booking, assignment or
   * report release must not fail because an SMS did. Silently skipped until SMS and that template's Content Id
   * are configured. Callers invoke it exactly where the matching email/push is sent, so it goes out once per event.
   */
  async orderSms(orderId: string, kind: OrderSmsKind, extra: { code?: string } = {}): Promise<void> {
    const template = ORDER_SMS[kind];
    const contentId = this.config.get<string>(template.env);
    if (!this.isConfigured() || !contentId) return;
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, user: { select: { phone: true } }, phlebotomist: { select: { user: { select: { name: true } } } } },
      });
      if (!order?.user.phone) return;

      let vars: string[];
      if (kind === 'sampleOtp') {
        if (!extra.code) return;
        vars = [extra.code];
      } else if (kind === 'phleboAssigned') {
        vars = [fit(order.phlebotomist?.user.name ?? 'your phlebotomist'), order.orderNumber];
      } else if (kind === 'bookingCancelled') {
        const support = (await this.prisma.siteSetting.findFirst({ select: { phone: true } }))?.phone;
        if (!support?.trim()) return;
        vars = [order.orderNumber, fit(support)];
      } else {
        vars = [order.orderNumber];
      }

      let i = 0;
      const text = template.text.replace(/\{#var#\}/g, () => vars[i++] ?? '');
      const from = kind === 'bookingConfirmed' ? undefined : this.config.get<string>('SMS_ORDER_SENDER_ID') || ORDER_SENDER_DEFAULT;
      await this.send(order.user.phone, text, contentId, from);
    } catch (err) {
      this.logger.error(`${kind} SMS for order ${orderId} failed: ${(err as Error).message}`);
    }
  }

  bookingConfirmedForOrder(orderId: string): Promise<void> {
    return this.orderSms(orderId, 'bookingConfirmed');
  }

  private async send(phone: string, text: string, dltContentId: string, from?: string): Promise<void> {
    const base = this.config.get<string>('SMS_API_BASE_URL')!.replace(/\/+$/, '');
    const digits = phone.replace(/\D/g, '');
    const to = digits.length === 10 ? `91${digits}` : digits;
    const params = new URLSearchParams({
      username: this.config.get<string>('SMS_API_USERNAME')!,
      password: this.config.get<string>('SMS_API_PASSWORD')!,
      unicode: 'false',
      from: from ?? this.config.get<string>('SMS_SENDER_ID')!,
      to,
      text,
      dltContentId,
    });

    let body: ProviderResponse;
    try {
      const res = await fetch(`${base}/fe/api/v1/send?${params.toString()}`, { signal: AbortSignal.timeout(10_000) });
      body = (await res.json()) as ProviderResponse;
    } catch (err) {
      // Never log the request URL — it carries the API password.
      this.logger.error(`SMS request failed for ${to.slice(0, -4)}XXXX: ${(err as Error).message}`);
      throw new SmsSendError('SMS gateway unreachable');
    }

    // The provider answers HTTP 200 even for failures — success is statusCode 200 / SUBMIT_ACCEPTED.
    if (body.statusCode === 200 || body.state === 'SUBMIT_ACCEPTED') {
      this.logger.log(`SMS accepted for ${to.slice(0, -4)}XXXX (transaction ${body.transactionId})`);
      return;
    }
    const reason = (body.statusCode && PROVIDER_ERRORS[body.statusCode]) || body.description || 'unknown error';
    this.logger.error(`SMS rejected for ${to.slice(0, -4)}XXXX: ${body.statusCode} ${reason}`);
    throw new SmsSendError(reason, body.statusCode);
  }
}
