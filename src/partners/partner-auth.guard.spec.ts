import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PartnerAuthGuard, revokePartnerToken, revokedTokenKey } from './partner-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';

// One secret for every realm (as in production) — only the `type` claim keeps the realms apart.
const jwt = new JwtService({ secret: 'test-secret' });

function context(token: string) {
  const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never };
}

// Every lookup an existing guard might make answers "active", so only the token type decides.
const activePrisma = {
  user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
  phlebotomist: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', user: { status: 'ACTIVE' } }) },
  lab: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
  adminUser: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
  referralPartner: { findUnique: jest.fn().mockResolvedValue({ type: 'DOCTOR' }) },
};
// Nothing on the logout list.
const redisOk = { exists: jest.fn().mockResolvedValue(0) };

const tokens = {
  patient: () => jwt.signAsync({ sub: 'u1', phone: '9876501234', role: 'PATIENT', type: 'patient' }),
  phlebotomist: () => jwt.signAsync({ sub: 'u2', phlebotomistId: 'p1', phone: '9876501235', type: 'phlebotomist' }),
  lab: () => jwt.signAsync({ sub: 'l1', email: 'lab@example.com', labId: 'l1', type: 'lab' }),
  admin: () => jwt.signAsync({ sub: 'a1', email: 'admin@example.com', type: 'admin' }),
  partner: () => jwt.signAsync({ sub: 'pt1', type: 'partner', partnerType: 'DOCTOR', phone: '9876501236' }),
};

describe('partner token realm isolation', () => {
  it('accepts a partner token on partner routes', async () => {
    const { req, ctx } = context(await tokens.partner());
    await expect(new PartnerAuthGuard(jwt, activePrisma as never, redisOk as never).canActivate(ctx)).resolves.toBe(true);
    expect(req.partner).toMatchObject({ sub: 'pt1', partnerType: 'DOCTOR' });
  });

  for (const other of ['patient', 'phlebotomist', 'lab', 'admin'] as const) {
    it(`rejects a ${other} token on partner routes`, async () => {
      const { ctx } = context(await tokens[other]());
      await expect(new PartnerAuthGuard(jwt, activePrisma as never, redisOk as never).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  }

  it('rejects a partner token on every existing realm (patient, phlebotomist, lab, admin)', async () => {
    const guards = [
      new JwtAuthGuard(jwt, activePrisma as never),
      new PhlebotomistAuthGuard(jwt, activePrisma as never),
      new LabAuthGuard(jwt, activePrisma as never),
      new AdminAuthGuard(jwt, activePrisma as never),
    ];
    for (const guard of guards) {
      const { ctx } = context(await tokens.partner());
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('rejects a token whose partner no longer exists, or whose type does not match', async () => {
    const missing = { referralPartner: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new PartnerAuthGuard(jwt, missing as never, redisOk as never).canActivate(context(await tokens.partner()).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const otherType = { referralPartner: { findUnique: jest.fn().mockResolvedValue({ type: 'CLINIC' }) } };
    await expect(new PartnerAuthGuard(jwt, otherType as never, redisOk as never).canActivate(context(await tokens.partner()).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing or forged token', async () => {
    const guard = new PartnerAuthGuard(jwt, activePrisma as never, redisOk as never);
    const noHeader = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never;
    await expect(guard.canActivate(noHeader)).rejects.toBeInstanceOf(UnauthorizedException);
    const forged = await new JwtService({ secret: 'other-secret' }).signAsync({ sub: 'pt1', type: 'partner', partnerType: 'DOCTOR' });
    await expect(guard.canActivate(context(forged).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('partner logout', () => {
  it('a logged-out token stops working at once, even if someone copied it', async () => {
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn(async (k: string, v: string, _mode: string, _ttl: number) => void store.set(k, v)),
      exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
    };
    const token = await tokens.partner();
    const guard = new PartnerAuthGuard(jwt, activePrisma as never, redis as never);
    await expect(guard.canActivate(context(token).ctx)).resolves.toBe(true);
    await revokePartnerToken(redis as never, token, Math.floor(Date.now() / 1000) + 600);
    expect(redis.set).toHaveBeenCalledWith(revokedTokenKey(token), '1', 'EX', expect.any(Number));
    expect(redis.set.mock.calls[0][3]).toBeLessThanOrEqual(600); // kept only until the token would expire anyway
    expect([...store.keys()][0]).not.toContain(token); // stored by hash, never the token itself
    await expect(guard.canActivate(context(token).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    // Another login (another token) is unaffected.
    const other = await jwt.signAsync({ sub: 'pt1', type: 'partner', partnerType: 'DOCTOR', phone: '9876501236', nonce: 2 });
    await expect(guard.canActivate(context(other).ctx)).resolves.toBe(true);
  });

  it('if Redis is unreachable, a valid token still works (signature, expiry and account are still checked)', async () => {
    const down = { exists: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const guard = new PartnerAuthGuard(jwt, activePrisma as never, down as never);
    await expect(guard.canActivate(context(await tokens.partner()).ctx)).resolves.toBe(true);
    const forged = await new JwtService({ secret: 'other-secret' }).signAsync({ sub: 'pt1', type: 'partner', partnerType: 'DOCTOR' });
    await expect(guard.canActivate(context(forged).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
