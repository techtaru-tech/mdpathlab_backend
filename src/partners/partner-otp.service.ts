import { randomInt } from 'crypto';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '../redis/redis.service.js';
import { SmsService } from '../sms/sms.service.js';

/**
 * Mobile OTP for the doctor/clinic portal. Same rules as the patient login (hashed code, expiry, attempt limit,
 * resend cooldown, same SMS template, same local "dev echo" rule) but kept entirely in Redis under partner:otp:*,
 * so it never reads or writes the patients' otp_challenges table or their otp:cooldown:* keys — a partner code can
 * never log anyone into the customer app, and a customer code can never open the partner portal.
 */
@Injectable()
export class PartnerOtpService {
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;
  private readonly devEcho: boolean;

  constructor(
    private readonly redis: RedisService,
    private readonly sms: SmsService,
    config: ConfigService,
  ) {
    this.ttlSeconds = Number(config.get('OTP_TTL_SECONDS', 300));
    this.maxAttempts = Number(config.get('OTP_MAX_ATTEMPTS', 5));
    this.cooldownSeconds = Number(config.get('OTP_RESEND_COOLDOWN_SECONDS', 30));
    this.devEcho =
      config.get<string>('OTP_DEV_ECHO', 'false') === 'true' &&
      config.get<string>('NODE_ENV', 'development') !== 'production' &&
      !this.sms.isConfigured();
  }

  static codeKey(phone: string) {
    return `partner:otp:code:${phone}`;
  }

  static cooldownKey(phone: string) {
    return `partner:otp:cooldown:${phone}`;
  }

  async request(phone: string) {
    const remaining = await this.redis.ttl(PartnerOtpService.cooldownKey(phone));
    if (remaining > 0) {
      throw new HttpException(
        { message: `Please wait ${remaining}s before requesting another OTP`, retryAfterSeconds: remaining },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 999999).toString();
    const hash = await bcrypt.hash(code, 10);
    // A new request replaces any earlier code for this number (and resets its attempt counter).
    await this.redis
      .multi()
      .del(PartnerOtpService.codeKey(phone))
      .hset(PartnerOtpService.codeKey(phone), { hash, attempts: '0' })
      .expire(PartnerOtpService.codeKey(phone), this.ttlSeconds)
      .exec();

    if (this.sms.isConfigured()) {
      try {
        await this.sms.sendOtp(phone, code);
      } catch {
        // Cooldown is only set after a successful send, so the person can retry straight away.
        throw new ServiceUnavailableException("We couldn't send the OTP right now — please try again in a moment");
      }
    } else {
      // No SMS gateway configured (local development): the log line stands in for the send.
      console.log(`[partner-otp] ${phone} -> ${code} (expires in ${this.ttlSeconds}s)`);
    }

    await this.redis.set(PartnerOtpService.cooldownKey(phone), '1', 'EX', this.cooldownSeconds);

    return {
      message: 'OTP sent',
      expiresInSeconds: this.ttlSeconds,
      ...(this.devEcho ? { devCode: code } : {}),
    };
  }

  /** Throws unless the code is right; a correct code works exactly once. */
  async verify(phone: string, code: string): Promise<void> {
    const key = PartnerOtpService.codeKey(phone);
    const hash = await this.redis.hget(key, 'hash');
    if (!hash) throw new BadRequestException('No active OTP for this number — request a new one');

    // Take an attempt first, atomically, so parallel guesses cannot all slip under the limit.
    const [[, attemptsRaw], [, ttl]] = (await this.redis.multi().hincrby(key, 'attempts', 1).ttl(key).exec()) as [
      [Error | null, number],
      [Error | null, number],
    ];
    if (ttl < 0) {
      // The code expired between the read and the increment, which re-created the key without an expiry.
      await this.redis.del(key);
      throw new BadRequestException('No active OTP for this number — request a new one');
    }
    const attempts = Number(attemptsRaw);
    if (attempts > this.maxAttempts) throw new ForbiddenException('Too many incorrect attempts — request a new OTP');

    if (!(await bcrypt.compare(code, hash))) {
      throw new BadRequestException(`Incorrect OTP — ${Math.max(this.maxAttempts - attempts, 0)} attempts remaining`);
    }

    // Consumed exactly once: of two requests with the right code, only the one that deletes the key succeeds.
    if ((await this.redis.del(key)) !== 1) throw new BadRequestException('This OTP was already used — request a new one');
  }
}
