import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';

export type AdminPermission = 'PARTNERS_VIEW' | 'PARTNERS_REVIEW' | 'PARTNER_SETTINGS' | 'REFERRALS_VIEW' | 'REFERRALS_MANAGE' | 'PAYOUTS_VIEW' | 'PAYOUTS_MANAGE';

const PERMISSIONS_KEY = 'adminPermissions';

/** Marks a route as needing these admin permissions (all of them). Used only on the referral-partner admin routes. */
export const RequireAdminPermission = (...permissions: AdminPermission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Runs after AdminAuthGuard (which sets req.admin) on the new admin routes only — no existing admin route uses it.
 * An admin with no AdminPermissionProfile row, or an unrestricted one, may do everything: exactly how every admin
 * works today. Only a profile with restricted=true limits that admin to the listed permissions.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<AdminPermission[] | undefined>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length === 0) return true;

    const adminId: string | undefined = context.switchToHttp().getRequest().admin?.sub;
    if (!adminId) throw new ForbiddenException('You do not have permission for this action');

    const profile = await this.prisma.adminPermissionProfile.findUnique({ where: { adminId } });
    if (!profile || !profile.restricted) return true;
    if (required.every((p) => profile.permissions.includes(p))) return true;
    throw new ForbiddenException('You do not have permission for this action');
  }
}
