import { NotFoundException } from '@nestjs/common';
import { FeatureSwitches } from './feature-switches';
import { PartnersEnabledGuard } from './partners-feature';
import { ReferralsEnabledGuard } from '../referrals/referrals-feature';
import { PartnersPublicController } from './partner-auth.controller';

const admin = { sub: 'a1', email: 'admin@example.com' };

function setup(row: { referralPartnersEnabled: boolean; referralsEnabled: boolean } | null) {
  const current = row ? { id: 's1', ...row } : null;
  const tx = {
    siteSetting: {
      findFirst: jest.fn().mockResolvedValue(current),
      create: jest.fn().mockResolvedValue({ id: 's1', referralPartnersEnabled: false, referralsEnabled: false }),
      update: jest.fn(async ({ data }: { data: object }) => ({ ...(current ?? { id: 's1', referralPartnersEnabled: false, referralsEnabled: false }), ...data })),
    },
    adminAuditLog: { create: jest.fn() },
  };
  const db = { siteSetting: { findFirst: jest.fn().mockResolvedValue(current) }, $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { switches: new FeatureSwitches(db as never), db, tx };
}

describe('Doctor registration / referral switches (admin settings)', () => {
  it('are off when nothing has been set (a fresh or existing database)', async () => {
    expect(await setup(null).switches.get()).toEqual({ referralPartnersEnabled: false, referralsEnabled: false });
    expect(await setup({ referralPartnersEnabled: false, referralsEnabled: false }).switches.partnersEnabled()).toBe(false);
  });

  it('a database error never turns a feature on', async () => {
    const { switches, db } = setup(null);
    db.siteSetting.findFirst.mockRejectedValue(new Error('connection lost'));
    expect(await switches.get()).toEqual({ referralPartnersEnabled: false, referralsEnabled: false });
  });

  it('reads the database at most once per 10 s', async () => {
    const { switches, db } = setup({ referralPartnersEnabled: true, referralsEnabled: false });
    await switches.partnersEnabled();
    await switches.referralsEnabled();
    expect(db.siteSetting.findFirst).toHaveBeenCalledTimes(1);
  });

  it('an admin change applies at once and is audited with before/after', async () => {
    const { switches, tx } = setup({ referralPartnersEnabled: false, referralsEnabled: false });
    expect(await switches.partnersEnabled()).toBe(false);
    expect(await switches.set({ referralPartnersEnabled: true }, admin)).toEqual({ referralPartnersEnabled: true, referralsEnabled: false });
    expect(tx.siteSetting.update).toHaveBeenCalledWith(expect.objectContaining({ data: { referralPartnersEnabled: true } }));
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'FEATURE_SWITCHES_UPDATE',
        adminId: 'a1',
        before: { referralPartnersEnabled: false, referralsEnabled: false },
        after: { referralPartnersEnabled: true, referralsEnabled: false },
      }),
    });
    expect(await switches.partnersEnabled()).toBe(true);
  });

  it('saving without a change writes no audit row', async () => {
    const { switches, tx } = setup({ referralPartnersEnabled: true, referralsEnabled: false });
    await switches.set({ referralPartnersEnabled: true }, admin);
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('creates the settings row if it does not exist yet', async () => {
    const { switches, tx } = setup(null);
    await switches.set({ referralsEnabled: true }, admin);
    expect(tx.siteSetting.create).toHaveBeenCalled();
  });

  it('partner and referral routes answer 404 while off, as if they did not exist', async () => {
    const off = setup({ referralPartnersEnabled: false, referralsEnabled: false }).switches;
    const on = setup({ referralPartnersEnabled: true, referralsEnabled: true }).switches;
    await expect(new PartnersEnabledGuard(off).canActivate()).rejects.toThrow(NotFoundException);
    await expect(new ReferralsEnabledGuard(off).canActivate()).rejects.toThrow(NotFoundException);
    expect(await new PartnersEnabledGuard(on).canActivate()).toBe(true);
    expect(await new ReferralsEnabledGuard(on).canActivate()).toBe(true);
  });

  it('the two switches are independent', async () => {
    const s = setup({ referralPartnersEnabled: true, referralsEnabled: false }).switches;
    expect(await new PartnersEnabledGuard(s).canActivate()).toBe(true);
    await expect(new ReferralsEnabledGuard(s).canActivate()).rejects.toThrow(NotFoundException);
  });

  it('still tells the website whether registration is open', async () => {
    expect(await new PartnersPublicController(setup(null).switches).availability()).toEqual({ enabled: false });
    expect(await new PartnersPublicController(setup({ referralPartnersEnabled: true, referralsEnabled: false }).switches).availability()).toEqual({ enabled: true });
  });
});
