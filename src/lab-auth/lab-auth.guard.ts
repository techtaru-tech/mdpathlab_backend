import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { requireActiveLab } from '../auth/account-status.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Guards lab-dashboard routes. Patient/admin/phlebotomist tokens are rejected — separate token realms. */
@Injectable()
export class LabAuthGuard implements CanActivate {
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
      if (payload.type !== 'lab') {
        throw new Error('wrong token type');
      }
      await requireActiveLab(this.prisma, payload.labId);
      req.lab = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
