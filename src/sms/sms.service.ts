import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// The exact text registered on DLT for the OTP template (DLT Content Id in SMS_OTP_DLT_CONTENT_ID),
// with {#var#} replaced by the code. Operators reject any SMS whose text differs from the approved
// template — even by a comma — so this must stay byte-for-byte identical to what DLT approved.
const OTP_TEMPLATE = 'MD PATH LAB - Your login OTP is {#var#}\nLogin for your Good Health.';

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

  constructor(private readonly config: ConfigService) {}

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

  private async send(phone: string, text: string, dltContentId: string): Promise<void> {
    const base = this.config.get<string>('SMS_API_BASE_URL')!.replace(/\/+$/, '');
    const digits = phone.replace(/\D/g, '');
    const to = digits.length === 10 ? `91${digits}` : digits;
    const params = new URLSearchParams({
      username: this.config.get<string>('SMS_API_USERNAME')!,
      password: this.config.get<string>('SMS_API_PASSWORD')!,
      unicode: 'false',
      from: this.config.get<string>('SMS_SENDER_ID')!,
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
