import { createHash } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export type PartnerTokenPayload = { sub: string; type: 'partner'; partnerType: 'DOCTOR' | 'CLINIC'; phone: string; exp?: number };

/** Redis key marking one logged-out token (by hash — the token itself is never stored). */
export function revokedTokenKey(token: string) {
  return `partner:revoked:${createHash('sha256').update(token).digest('hex')}`;
}

/** Logout: the token stops working at once instead of living out its 12 hours. The key expires with the token. */
export async function revokePartnerToken(redis: RedisService, token: string, exp: number | undefined) {
  const ttl = Math.max(1, (exp ?? Math.floor(Date.now() / 1000) + 12 * 3600) - Math.floor(Date.now() / 1000));
  await redis.set(revokedTokenKey(token), '1', 'EX', ttl);
}

/**
 * Guards doctor/clinic portal routes. Patient, phlebotomist, lab and admin tokens are rejected (and every one of
 * their guards rejects a partner token) — separate token realms, same convention as LabAuthGuard. A rejected or
 * suspended partner can still sign in to see their status; what each status may do is decided per route.
 */
@Injectable()
export class PartnerAuthGuard implements CanActivate {
  private readonly logger = new Logger('PartnerAuthGuard');

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync<PartnerTokenPayload>(token);
      if (payload.type !== 'partner') {
        throw new Error('wrong token type');
      }
      if (await this.isRevoked(token)) {
        throw new Error('logged out');
      }
      // Checked on every request (not cached), like the other realms, so a removed account stops working at once.
      const partner = await this.prisma.referralPartner.findUnique({ where: { id: payload.sub }, select: { type: true } });
      if (!partner || partner.type !== payload.partnerType) {
        throw new Error('unknown partner');
      }
      req.partner = payload;
      req.partnerToken = token;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // If Redis is briefly unreachable the token is still checked for signature, expiry and account — only the
  // logout list is skipped — so a Redis hiccup doesn't lock every doctor out of the portal.
  private async isRevoked(token: string): Promise<boolean> {
    try {
      return (await this.redis.exists(revokedTokenKey(token))) === 1;
    } catch (err) {
      this.logger.warn(`Could not check the logout list: ${(err as Error).message}`);
      return false;
    }
  }
}
