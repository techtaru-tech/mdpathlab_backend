import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireActivePhlebotomist } from './account-status.js';

export interface PhlebotomistRequest extends Request {
  phlebotomist?: { sub: string; phlebotomistId: string; phone: string; type: 'phlebotomist' };
}

/** Guards phlebotomist-facing routes. Patient/admin tokens are rejected — separate token realms. */
@Injectable()
export class PhlebotomistAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      if (payload.type !== 'phlebotomist') {
        throw new Error('wrong token type');
      }
      await requireActivePhlebotomist(this.prisma, payload.sub, payload.phlebotomistId);
      req.phlebotomist = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
