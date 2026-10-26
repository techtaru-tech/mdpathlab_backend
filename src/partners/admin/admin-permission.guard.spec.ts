import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermissionGuard } from './admin-permission.guard';

function run(profile: unknown, required: string[] | undefined, adminId: string | null = 'a1') {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const prisma = { adminPermissionProfile: { findUnique: jest.fn().mockResolvedValue(profile) } };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ admin: adminId ? { sub: adminId, email: 'admin@example.com' } : undefined }) }),
  } as never;
  return { result: new AdminPermissionGuard(reflector, prisma as never).canActivate(ctx), prisma };
}

describe('AdminPermissionGuard (new admin routes only)', () => {
  it('lets an admin with no permission profile do everything — exactly today\'s behaviour', async () => {
    await expect(run(null, ['PARTNERS_REVIEW']).result).resolves.toBe(true);
  });

  it('lets an unrestricted profile do everything', async () => {
    await expect(run({ restricted: false, permissions: [] }, ['PARTNER_SETTINGS']).result).resolves.toBe(true);
  });

  it('limits a restricted admin to the listed permissions', async () => {
    await expect(run({ restricted: true, permissions: ['PARTNERS_VIEW'] }, ['PARTNERS_VIEW']).result).resolves.toBe(true);
    await expect(run({ restricted: true, permissions: ['PARTNERS_VIEW'] }, ['PARTNERS_REVIEW']).result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not touch the database for a route without requirements', async () => {
    const { result, prisma } = run(null, undefined);
    await expect(result).resolves.toBe(true);
    expect(prisma.adminPermissionProfile.findUnique).not.toHaveBeenCalled();
  });

  it('refuses when no admin is on the request', async () => {
    await expect(run(null, ['PARTNERS_VIEW'], null).result).rejects.toBeInstanceOf(ForbiddenException);
  });
});
