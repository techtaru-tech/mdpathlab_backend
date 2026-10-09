import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireActivePatient } from './account-status.js';

export interface AuthenticatedRequest extends Request {
  user?: { sub: string; phone: string; role: 'PATIENT' | 'PHLEBOTOMIST'; type: 'patient' };
}

/** Guards patient-facing routes. Rejects admin tokens too — the two token types are not interchangeable. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
      if (payload.type !== 'patient') {
        throw new Error('wrong token type');
      }
      await requireActivePatient(this.prisma, payload.sub);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
