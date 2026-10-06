import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import nodemailer, { type Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  bookingConfirmedEmail,
  homeVisitAssignedEmail,
  homeVisitTestsAddedEmail,
  reportReadyEmail,
  testEmail,
  type RenderedEmail,
} from './mail-templates.js';

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SendOptions = { userId?: string | null; to: string; template: string; email: RenderedEmail; orderId?: string; unsubscribeUrl?: string };

/**
 * Outgoing transactional email over SMTP (Plesk mail server). Same convention as
 * NotificationsService: it never throws into the caller — a failed email must not fail the booking
 * or report release that triggered it. Every attempt (sent, failed, or deliberately skipped) is
 * written to EmailLog so admin can see what happened. Disabled until SMTP_* is configured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** HTTPS email API (Brevo). Preferred when set: works where outbound SMTP ports are blocked. */
  private useBrevo(): boolean {
    return Boolean(this.config.get('BREVO_API_KEY'));
  }

  isConfigured(): boolean {
    return this.useBrevo() || Boolean(this.config.get('SMTP_HOST') && this.config.get('SMTP_USER') && this.config.get('SMTP_PASSWORD'));
  }

  get appUrl(): string {
    return (this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:8080').replace(/\/+$/, '');
  }

  private get apiUrl(): string {
    return (this.config.get<string>('PUBLIC_API_URL') ?? `${this.appUrl}/api`).replace(/\/+$/, '');
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const port = Number(this.config.get('SMTP_PORT', 465));
      const smtpHost = this.config.get<string>('SMTP_HOST')!;
      // Optional: connect somewhere else than SMTP_HOST (e.g. a local forwarder on 127.0.0.1 when the
      // hosting firewall blocks outbound SMTP ports). TLS is still verified against SMTP_HOST, so the
      // real mail server certificate must match — the forwarder only moves bytes.
      const connectHost = this.config.get<string>('SMTP_CONNECT_HOST') || smtpHost;
      const connectPort = Number(this.config.get('SMTP_CONNECT_PORT') || port);
      this.transporter = nodemailer.createTransport({
        host: connectHost,
        port: connectPort,
        // 465 = implicit TLS, 587 = STARTTLS. The server certificate is always verified (no
        // rejectUnauthorized: false) — an expired/mismatched cert should fail loudly in the log.
        secure: port === 465,
        tls: { servername: smtpHost },
        auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') },
        connectionTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transporter;
  }

  private fromEmail(): string {
    return this.config.get<string>('SMTP_FROM_EMAIL') || this.config.get<string>('SMTP_USER')!;
  }

  private fromName(): string {
    return this.config.get<string>('SMTP_FROM_NAME') || 'MD Path Labs';
  }

  private fromAddress(): string {
    return `"${this.fromName().replace(/"/g, '')}" <${this.fromEmail()}>`;
  }

  /** One message through Brevo's HTTPS API. Throws with the provider's own error text on failure. */
  private async sendViaBrevo(opts: SendOptions): Promise<string | undefined> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.config.get<string>('BREVO_API_KEY')!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: this.fromName(), email: this.fromEmail() },
        to: [{ email: opts.to }],
        subject: opts.email.subject,
        htmlContent: opts.email.html,
        textContent: opts.email.text,
        ...(opts.unsubscribeUrl ? { headers: { 'List-Unsubscribe': '<' + opts.unsubscribeUrl + '>' } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message ?? body.code ?? 'request failed'}`);
    return body.messageId;
  }

  /** One-click unsubscribe link carried in every email — a signed token, so no login is needed. */
  unsubscribeUrl(userId: string): string {
    const token = this.jwt.sign({ sub: userId, purpose: 'email-unsubscribe' }, { expiresIn: 60 * 60 * 24 * 365 });
    return `${this.apiUrl}/mail/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async unsubscribe(token: string): Promise<boolean> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(token);
      if (payload.purpose !== 'email-unsubscribe') return false;
      await this.prisma.user.update({ where: { id: payload.sub }, data: { emailNotifications: false } });
      return true;
    } catch {
      return false;
    }
  }

  private async log(opts: SendOptions, status: 'SENT' | 'FAILED' | 'SKIPPED', extra: { error?: string; messageId?: string; attempts?: number } = {}) {
    await this.prisma.emailLog
      .create({
        data: {
          userId: opts.userId ?? null,
          toEmail: opts.to,
          template: opts.template,
          subject: opts.email.subject,
          status,
          error: extra.error?.slice(0, 500) ?? null,
          messageId: extra.messageId ?? null,
          orderId: opts.orderId ?? null,
          attempts: extra.attempts ?? 1,
        },
      })
      .catch((err) => this.logger.error(`Could not write email log: ${(err as Error).message}`));
  }

  private async deliver(opts: SendOptions): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    if (!this.isConfigured()) {
      await this.log(opts, 'SKIPPED', { error: 'Email is not configured (no BREVO_API_KEY or SMTP settings)' });
      return 'SKIPPED';
    }
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const messageId = this.useBrevo()
          ? await this.sendViaBrevo(opts)
          : (
              await this.getTransporter().sendMail({
                from: this.fromAddress(),
                to: opts.to,
                subject: opts.email.subject,
                html: opts.email.html,
                text: opts.email.text,
                ...(opts.unsubscribeUrl ? { list: { unsubscribe: opts.unsubscribeUrl } } : {}),
              })
            ).messageId;
        await this.log(opts, 'SENT', { messageId, attempts: attempt });
        return 'SENT';
      } catch (err) {
        lastError = (err as Error).message;
        this.logger.warn(`Email "${opts.template}" attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);
        if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1500);
      }
    }
    await this.log(opts, 'FAILED', { error: lastError, attempts: MAX_ATTEMPTS });
    return 'FAILED';
  }

  /** Sends to a user if they have an email and haven't opted out. Never throws. */
  private async sendToUser(userId: string, template: string, build: (ctx: { name: string | null; appUrl: string; unsubscribeUrl: string }) => RenderedEmail, orderId?: string) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailNotifications: true } });
      if (!user?.email) return;
      const unsubscribeUrl = this.unsubscribeUrl(userId);
      const email = build({ name: user.name, appUrl: this.appUrl, unsubscribeUrl });
      if (!user.emailNotifications) {
        await this.log({ userId, to: user.email, template, email, orderId }, 'SKIPPED', { error: 'User turned email notifications off' });
        return;
      }
      await this.deliver({ userId, to: user.email, template, email, orderId, unsubscribeUrl });
    } catch (err) {
      this.logger.error(`Email "${template}" for user ${userId} failed unexpectedly: ${(err as Error).message}`);
    }
  }

  // ---------- Events ----------

  bookingConfirmed(userId: string, d: { orderNumber: string; orderId: string; items: string[]; total: number; collection: string; when: string; payment: string }) {
    return this.sendToUser(userId, 'booking-confirmed', (ctx) => bookingConfirmedEmail({ ...ctx, ...d }), d.orderId);
  }

  /** Booking-confirmed email built from the stored order, so every confirmation path sends the same thing. */
  async bookingConfirmedForOrder(orderId: string) {
    try {
      const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, slot: true } });
      if (!o) return;
      const day = o.scheduledDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      await this.bookingConfirmed(o.userId, {
        orderNumber: o.orderNumber,
        orderId: o.id,
        items: o.items.map((i) => i.itemName),
        total: o.total,
        collection: o.collectionType === 'HOME' ? 'Home sample collection' : 'Visit to a collection centre',
        when: day ? (o.slot ? `${day}, ${o.slot.label}` : day) : 'To be scheduled',
        payment: o.paymentStatus === 'PAID' ? 'Paid' : o.paymentMethod === 'COD' ? 'Pay on collection' : 'Payment pending',
      });
    } catch (err) {
      this.logger.error(`Booking email for order ${orderId} failed unexpectedly: ${(err as Error).message}`);
    }
  }

  reportReady(userId: string, d: { orderNumber: string; orderId: string }) {
    return this.sendToUser(userId, 'report-ready', (ctx) => reportReadyEmail({ ...ctx, ...d }), d.orderId);
  }

  homeVisitAssigned(userId: string, d: { phlebotomist: string; date: string; window: string }) {
    return this.sendToUser(userId, 'home-visit-assigned', (ctx) => homeVisitAssignedEmail({ ...ctx, ...d }));
  }

  homeVisitTestsAdded(userId: string, d: { orderNumber: string; orderId: string; items: string[]; total: number }) {
    return this.sendToUser(userId, 'home-visit-tests-added', (ctx) => homeVisitTestsAddedEmail({ ...ctx, ...d }), d.orderId);
  }

  /** Admin "send test email" — bypasses the user opt-out, reports the real result. */
  async sendTest(to: string): Promise<{ status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string }> {
    const email = testEmail({ appUrl: this.appUrl });
    const status = await this.deliver({ to, template: 'test', email });
    if (status === 'SENT') return { status };
    const last = await this.prisma.emailLog.findFirst({ where: { toEmail: to, template: 'test' }, orderBy: { createdAt: 'desc' } });
    return { status, error: last?.error ?? undefined };
  }
}
