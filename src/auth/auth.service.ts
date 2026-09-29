import { randomInt } from 'crypto';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SmsService } from '../sms/sms.service.js';
import { CompleteProfileDto } from './dto/complete-profile.dto.js';

@Injectable()
export class AuthService {
  private readonly otpTtlSeconds: number;
  private readonly otpMaxAttempts: number;
  private readonly resendCooldownSeconds: number;
  private readonly devEcho: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
  ) {
    this.otpTtlSeconds = Number(this.config.get('OTP_TTL_SECONDS', 300));
    this.otpMaxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS', 5));
    this.resendCooldownSeconds = Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS', 30));
    // Never echo the code back once real SMS is live — the API response would let anyone who knows a
    // phone number read that user's OTP.
    this.devEcho =
      this.config.get<string>('OTP_DEV_ECHO', 'false') === 'true' &&
      this.config.get<string>('NODE_ENV', 'development') !== 'production' &&
      !this.sms.isConfigured();
  }

  async requestOtp(phone: string) {
    const cooldownKey = `otp:cooldown:${phone}`;
    const remainingTtl = await this.redis.ttl(cooldownKey);
    if (remainingTtl > 0) {
      throw new HttpException(
        { message: `Please wait ${remainingTtl}s before requesting another OTP`, retryAfterSeconds: remainingTtl },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);

    await this.prisma.otpChallenge.create({
      data: { phone, codeHash, expiresAt, maxAttempts: this.otpMaxAttempts },
    });

    if (this.sms.isConfigured()) {
      try {
        await this.sms.sendOtp(phone, code);
      } catch {
        // Cooldown is only set after a successful send, so the user can retry straight away.
        throw new ServiceUnavailableException("We couldn't send the OTP right now — please try again in a moment");
      }
    } else {
      // No SMS gateway configured (local development): the log line stands in for the send.
      console.log(`[otp] ${phone} -> ${code} (expires in ${this.otpTtlSeconds}s)`);
    }

    await this.redis.set(cooldownKey, '1', 'EX', this.resendCooldownSeconds);

    return {
      message: 'OTP sent',
      expiresInSeconds: this.otpTtlSeconds,
      ...(this.devEcho ? { devCode: code } : {}),
    };
  }

  /**
   * Shared by verifyOtp() (login/signup) and changePhone() (mobile-number update from settings)
   * — both need the exact same challenge-lookup/expiry/attempts/compare/consume logic, just
   * with a different action taken once the code checks out.
   */
  private async verifyOtpChallenge(phone: string, code: string) {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('No active OTP for this number — request a new one');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP expired — request a new one');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new ForbiddenException('Too many incorrect attempts — request a new OTP');
    }

    const isValid = await bcrypt.compare(code, challenge.codeHash);
    if (!isValid) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const attemptsRemaining = challenge.maxAttempts - (challenge.attempts + 1);
      throw new BadRequestException(`Incorrect OTP — ${Math.max(attemptsRemaining, 0)} attempts remaining`);
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
  }

  async verifyOtp(phone: string, code: string) {
    await this.verifyOtpChallenge(phone, code);

    // Distinguishing create from update (rather than a plain upsert) is only so a genuinely NEW
    // account gets the one-time wallet welcome bonus below — existing logins must never re-credit it.
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    let user = existing;
    if (!user) {
      const bonus = Number(this.config.get('WALLET_SIGNUP_BONUS', 0));
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { phone, role: 'PATIENT', walletBalance: bonus > 0 ? bonus : 0 } });
        if (bonus > 0) {
          await tx.walletTransaction.create({
            data: { userId: created.id, type: 'CREDIT', amount: bonus, reason: 'Welcome bonus' },
          });
        }
        return created;
      });
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, phone: user.phone, role: user.role, type: 'patient' });

    return {
      accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        isProfileComplete: Boolean(user.name),
      },
    };
  }

  /**
   * Phlebotomist login — deliberately NOT an upsert like verifyOtp(). Accounts are admin-created
   * only (FSD §2.1: no self-registration), so a phone number with no existing PHLEBOTOMIST user
   * is simply not a valid login, not a signal to create one.
   */
  async verifyPhlebotomistOtp(phone: string, code: string) {
    await this.verifyOtpChallenge(phone, code);

    const user = await this.prisma.user.findUnique({ where: { phone }, include: { phlebotomist: true } });
    if (!user || user.role !== 'PHLEBOTOMIST' || !user.phlebotomist) {
      throw new ForbiddenException('This number is not registered as a phlebotomist');
    }
    if (user.phlebotomist.status !== 'ACTIVE') {
      throw new ForbiddenException('This phlebotomist account is not active');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phlebotomistId: user.phlebotomist.id,
      phone: user.phone,
      type: 'phlebotomist',
    });

    return {
      accessToken,
      phlebotomist: {
        id: user.phlebotomist.id,
        userId: user.id,
        phone: user.phone,
        name: user.name,
        employeeCode: user.phlebotomist.employeeCode,
        status: user.phlebotomist.status,
      },
    };
  }

  /** Same OTP-sending path as login — the uniqueness check happens here, before the user goes
   *  through the OTP flow, so they get an immediate answer instead of failing at the end. */
  async requestPhoneChangeOtp(userId: string, newPhone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This mobile number is already registered to another account');
    }
    return this.requestOtp(newPhone);
  }

  async changePhone(userId: string, newPhone: string, code: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This mobile number is already registered to another account');
    }

    await this.verifyOtpChallenge(newPhone, code);

    const user = await this.prisma.user.update({ where: { id: userId }, data: { phone: newPhone } });
    // The JWT carries the phone claim — issue a fresh token so the session isn't left holding
    // a token for a number that no longer resolves to this account.
    const accessToken = await this.jwt.signAsync({ sub: user.id, phone: user.phone, role: user.role, type: 'patient' });

    return {
      accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        isProfileComplete: Boolean(user.name),
      },
    };
  }

  /**
   * FSD §2.7 Profile — "Contact Number (view/edit)". Same OTP-on-the-new-number pattern as the
   * patient's requestPhoneChangeOtp() — the uniqueness check happens before the OTP round-trip so
   * a phlebotomist gets an immediate answer rather than failing at the end. No password exists for
   * phlebotomists (OTP-only login, per Phase 1), so §2.7's "Change Password" item does not apply.
   */
  async requestPhlebotomistPhoneChangeOtp(userId: string, newPhone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This mobile number is already registered to another account');
    }
    return this.requestOtp(newPhone);
  }

  async changePhlebotomistPhone(userId: string, newPhone: string, code: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This mobile number is already registered to another account');
    }

    await this.verifyOtpChallenge(newPhone, code);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: newPhone },
      include: { phlebotomist: true },
    });
    if (!user.phlebotomist) {
      throw new ForbiddenException('This account is not a phlebotomist account');
    }

    // The JWT carries the phone claim — issue a fresh token so the session isn't left holding
    // a token for a number that no longer resolves to this account.
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phlebotomistId: user.phlebotomist.id,
      phone: user.phone,
      type: 'phlebotomist',
    });

    return {
      accessToken,
      phlebotomist: {
        id: user.phlebotomist.id,
        userId: user.id,
        phone: user.phone,
        name: user.name,
        employeeCode: user.phlebotomist.employeeCode,
        status: user.phlebotomist.status,
      },
    };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
        ...(dto.city ? { city: dto.city } : {}),
      },
    });

    return {
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        isProfileComplete: Boolean(user.name),
      },
    };
  }
}
