import { randomInt } from 'crypto';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
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
  ) {
    this.otpTtlSeconds = Number(this.config.get('OTP_TTL_SECONDS', 300));
    this.otpMaxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS', 5));
    this.resendCooldownSeconds = Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS', 30));
    this.devEcho =
      this.config.get<string>('OTP_DEV_ECHO', 'false') === 'true' &&
      this.config.get<string>('NODE_ENV', 'development') !== 'production';
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

    await this.redis.set(cooldownKey, '1', 'EX', this.resendCooldownSeconds);

    // SMS gateway isn't wired yet (blocked on client-provided provider credentials —
    // see the development plan's open items). Logging here stands in for that send.
    console.log(`[otp] ${phone} -> ${code} (expires in ${this.otpTtlSeconds}s)`);

    return {
      message: 'OTP sent',
      expiresInSeconds: this.otpTtlSeconds,
      ...(this.devEcho ? { devCode: code } : {}),
    };
  }

  async verifyOtp(phone: string, code: string) {
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

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone, role: 'PATIENT' },
    });

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
