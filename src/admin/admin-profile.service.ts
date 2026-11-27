import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service.js';
import { adminSecurityEmail } from '../mail/mail-templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { writeAdminAudit } from '../partners/admin/admin-audit.js';

type Purpose = 'email' | 'password';
const CODE_TTL_SECONDS = 10 * 60;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const maskEmail = (email: string) => {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
};

/**
 * The signed-in admin's own profile: name and mobile (no verification), email (current password + a code sent to
 * the NEW address) and password (current password + a code sent to the current address). A password change ends
 * every other session (AdminUser.credentialsChangedAt, checked by AdminAuthGuard) and returns a fresh token for
 * this one. Codes are 6 digits, hashed, kept in Redis for 10 minutes, 5 tries, one per minute.
 */
@Injectable()
export class AdminProfileService {
  private readonly devEcho: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    // Locally, without an email service, the code comes back in the response so the screens can be tried.
    this.devEcho = config.get<string>('NODE_ENV', 'development') !== 'production' && !this.mail.isConfigured();
  }

  private key(adminId: string, purpose: Purpose) {
    return `admin:verify:${purpose}:${adminId}`;
  }

  private async admin(adminId: string) {
    const a = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!a || a.status !== 'ACTIVE') throw new UnauthorizedException();
    return a;
  }

  private view(a: { id: string; email: string; name: string; phone: string | null; createdAt: Date; credentialsChangedAt: Date | null }) {
    return { id: a.id, email: a.email, name: a.name, phone: a.phone, createdAt: a.createdAt, passwordChangedAt: a.credentialsChangedAt };
  }

  private async checkPassword(passwordHash: string, password: string) {
    if (!(await bcrypt.compare(password, passwordHash))) throw new BadRequestException('Your current password is not correct');
  }

  private token(a: { id: string; email: string }) {
    return this.jwt.signAsync({ sub: a.id, email: a.email, type: 'admin' });
  }

  private sendMail(to: string, name: string, template: string, subject: string, lines: string[], code?: string) {
    void this.mail.sendToPartner(to, template, (ctx) => adminSecurityEmail({ ...ctx, name, subject, heading: subject, lines, ...(code ? { code } : {}) }));
  }

  /** A new code for this admin and purpose (replacing any earlier one), kept with what it is for. */
  private async issueCode(adminId: string, purpose: Purpose, data: Record<string, string> = {}) {
    const cooldown = `${this.key(adminId, purpose)}:cooldown`;
    const wait = await this.redis.ttl(cooldown);
    if (wait > 0) throw new HttpException({ message: `Please wait ${wait}s before asking for another code`, retryAfterSeconds: wait }, HttpStatus.TOO_MANY_REQUESTS);
    const code = randomInt(100000, 999999).toString();
    const k = this.key(adminId, purpose);
    await this.redis
      .multi()
      .del(k)
      .hset(k, { hash: await bcrypt.hash(code, 10), attempts: '0', ...data })
      .expire(k, CODE_TTL_SECONDS)
      .set(cooldown, '1', 'EX', COOLDOWN_SECONDS)
      .exec();
    return code;
  }

  /** Checks the code (5 tries) and uses it up; returns what was stored with it. */
  private async useCode(adminId: string, purpose: Purpose, code: string): Promise<Record<string, string>> {
    const k = this.key(adminId, purpose);
    const stored = await this.redis.hgetall(k);
    if (!stored?.hash) throw new BadRequestException('The code has expired — ask for a new one');
    const attempts = await this.redis.hincrby(k, 'attempts', 1);
    if (attempts > MAX_ATTEMPTS) {
      await this.redis.del(k);
      throw new ForbiddenException('Too many wrong codes — ask for a new one');
    }
    if (!(await bcrypt.compare(code, stored.hash))) throw new BadRequestException(`Wrong code — ${Math.max(MAX_ATTEMPTS - attempts, 0)} tries left`);
    if ((await this.redis.del(k)) !== 1) throw new BadRequestException('This code was already used — ask for a new one');
    return stored;
  }

  // ---------------------------------------------------------------- profile

  async get(adminId: string) {
    return this.view(await this.admin(adminId));
  }

  async update(adminId: string, dto: { name?: string; phone?: string | null }) {
    await this.admin(adminId);
    const updated = await this.prisma.adminUser.update({
      where: { id: adminId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
    });
    return this.view(updated);
  }

  // ---------------------------------------------------------------- email

  async requestEmailChange(adminId: string, newEmail: string, currentPassword: string) {
    const a = await this.admin(adminId);
    await this.checkPassword(a.passwordHash, currentPassword);
    if (newEmail === a.email) throw new BadRequestException('That is already your email');
    if (await this.prisma.adminUser.findUnique({ where: { email: newEmail }, select: { id: true } })) {
      throw new ConflictException('Another admin account already uses this email');
    }
    const code = await this.issueCode(adminId, 'email', { newEmail });
    this.sendMail(newEmail, a.name, 'admin-email-change-code', 'Confirm your new admin email', [
      'Use this code to confirm this address as the new email of your MD Path Labs admin account.',
      'It expires in 10 minutes. If you did not ask for this, ignore this email.',
    ], code);
    return { sentTo: maskEmail(newEmail), expiresInSeconds: CODE_TTL_SECONDS, ...(this.devEcho ? { devCode: code } : {}) };
  }

  async confirmEmailChange(adminId: string, code: string) {
    const a = await this.admin(adminId);
    const { newEmail } = await this.useCode(adminId, 'email', code);
    if (!newEmail) throw new BadRequestException('Ask for a new code');
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.adminUser.update({ where: { id: adminId }, data: { email: newEmail } });
        await writeAdminAudit(tx, { sub: adminId, email: newEmail }, { action: 'ADMIN_EMAIL_CHANGED', entityType: 'AdminUser', entityId: adminId, before: { email: maskEmail(a.email) }, after: { email: maskEmail(newEmail) } });
        return u;
      });
    } catch {
      throw new ConflictException('Another admin account already uses this email');
    }
    // The old address hears about it, in case someone else made the change.
    this.sendMail(a.email, a.name, 'admin-email-changed', 'Your admin email was changed', [
      `The email of your MD Path Labs admin account was changed to ${maskEmail(newEmail)}.`,
      'If you did not make this change, contact the other admins immediately.',
    ]);
    return { accessToken: await this.token(updated), profile: this.view(updated) };
  }

  // ---------------------------------------------------------------- password

  async requestPasswordChange(adminId: string, currentPassword: string) {
    const a = await this.admin(adminId);
    await this.checkPassword(a.passwordHash, currentPassword);
    const code = await this.issueCode(adminId, 'password');
    this.sendMail(a.email, a.name, 'admin-password-change-code', 'Your code to change the admin password', [
      'Use this code to set a new password for your MD Path Labs admin account.',
      'It expires in 10 minutes. If you did not ask for this, change your password straight away.',
    ], code);
    return { sentTo: maskEmail(a.email), expiresInSeconds: CODE_TTL_SECONDS, ...(this.devEcho ? { devCode: code } : {}) };
  }

  async changePassword(adminId: string, code: string, newPassword: string) {
    const a = await this.admin(adminId);
    if (await bcrypt.compare(newPassword, a.passwordHash)) throw new BadRequestException('Choose a password different from the current one');
    await this.useCode(adminId, 'password', code);
    // Tokens carry whole seconds: everything issued before this second stops working (this session gets a new one).
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.adminUser.update({ where: { id: adminId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), credentialsChangedAt: changedAt } });
      await writeAdminAudit(tx, { sub: adminId, email: a.email }, { action: 'ADMIN_PASSWORD_CHANGED', entityType: 'AdminUser', entityId: adminId });
      return u;
    });
    this.sendMail(a.email, a.name, 'admin-password-changed', 'Your admin password was changed', [
      'The password of your MD Path Labs admin account was just changed, and every other signed-in browser was signed out.',
      'If you did not make this change, contact the other admins immediately.',
    ]);
    return { accessToken: await this.token(updated), profile: this.view(updated) };
  }
}
