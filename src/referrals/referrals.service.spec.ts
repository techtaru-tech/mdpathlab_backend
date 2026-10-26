import { BadRequestException, ConflictException } from '@nestjs/common';

jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,QR') }), { virtual: true });

import { ReferralsService } from './referrals.service';

function setup(o: { existing?: boolean; code?: unknown; orders?: number; userPhone?: string } = {}) {
  const codeRow =
    o.code === undefined
      ? { id: 'c1', code: 'MD23ABCDEF', retiredAt: null, partner: { id: 'p1', type: 'DOCTOR', displayName: 'Dr P', status: 'APPROVED', phone: '9000000001' } }
      : o.code;
  const db = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: { findUnique: jest.fn().mockResolvedValue({ phone: o.userPhone ?? '9000000002', role: 'PATIENT' }), findUniqueOrThrow: jest.fn().mockResolvedValue({ phone: '9000000002' }) },
    patientReferral: {
      findUnique: jest.fn().mockResolvedValue(o.existing ? { id: 'r0', partnerId: 'p0', status: 'ACTIVE' } : null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    patientReferralEvent: { create: jest.fn() },
    referralCode: { findUnique: jest.fn().mockResolvedValue(codeRow), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    referralAttempt: { create: jest.fn() },
    referralPartner: { findUnique: jest.fn().mockResolvedValue({ id: 'p2', status: 'APPROVED', phone: '9000000003' }) },
    order: { count: jest.fn().mockResolvedValue(o.orders ?? 0) },
    orderReferralAttribution: { count: jest.fn().mockResolvedValue(0) },
    adminAuditLog: { create: jest.fn() },
  };
  const prisma = { ...db, $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)) };
  const config = { get: (k: string, d?: unknown) => ({ APP_PUBLIC_URL: 'https://mdpathlabs.test', JWT_SECRET: 's' })[k] ?? d };
  const notifications = { notifyAdmins: jest.fn() };
  return { service: new ReferralsService(prisma as never, config as never, notifications as never), db, notifications };
}

describe('ReferralsService.claim', () => {
  it('binds a new patient: referral + BOUND event + attempt, under the checkout lock', async () => {
    const { service, db } = setup();
    const res = await service.claim('u1', 'md23abcdef', 'QR', '2026-10-23T10:00:00.000Z', '127.0.0.1');
    expect(res).toEqual({ status: 'BOUND', partner: { type: 'DOCTOR', displayName: 'Dr P' } });
    // Same advisory-lock key as OrdersService.createOrderInTx, so a claim and a first booking cannot interleave.
    expect(db.$executeRaw.mock.calls[0]).toEqual(expect.arrayContaining(['checkout:u1']));
    expect(db.patientReferral.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', partnerId: 'p1', codeId: 'c1', source: 'QR', boundVia: 'SELF_CLAIM' }) });
    expect(db.patientReferralEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'BOUND', toPartnerId: 'p1', actorType: 'PATIENT' }) });
    expect(db.referralAttempt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'BOUND', codeAttempted: 'MD23ABCDEF' }) });
    expect(db.referralAttempt.create.mock.calls[0][0].data.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    ['an existing customer (any order, even cancelled)', { orders: 1 }, 'EXISTING_CUSTOMER', 'NOT_ELIGIBLE'],
    ['an already-referred patient', { existing: true }, 'ALREADY_REFERRED', 'ALREADY_REFERRED'],
    ['the partner themselves', { userPhone: '9000000001' }, 'SELF_REFERRAL', 'NOT_ELIGIBLE'],
    ['a suspended partner', { code: { id: 'c1', retiredAt: null, partner: { id: 'p1', type: 'DOCTOR', displayName: 'X', status: 'SUSPENDED', phone: '9' } } }, 'PARTNER_NOT_ACTIVE', 'NOT_ELIGIBLE'],
    ['an unknown code', { code: null }, 'INVALID_CODE', 'INVALID'],
  ])('does not bind %s, and logs the real reason', async (_label, opts, outcome, shown) => {
    const { service, db } = setup(opts as never);
    const res = await service.claim('u1', 'MD23ABCDEF', 'LINK', undefined, undefined);
    expect(res).toEqual({ status: shown });
    expect(db.patientReferral.create).not.toHaveBeenCalled();
    expect(db.referralAttempt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome }) });
  });

  it('treats a malformed code as invalid without looking it up', async () => {
    const { service, db } = setup();
    expect((await service.claim('u1', '../../x', 'LINK', undefined, undefined)).status).toBe('INVALID');
    expect(db.referralCode.findUnique).not.toHaveBeenCalled();
  });

  it('alerts admins exactly when a partner reaches the daily velocity threshold', async () => {
    const { service, db, notifications } = setup();
    db.patientReferral.count.mockResolvedValue(20);
    await service.claim('u1', 'MD23ABCDEF', 'LINK', undefined, undefined);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'REFERRAL_VELOCITY' }) }));
  });
});

describe('ReferralsService — public and admin', () => {
  it('lookup hides partners that are not approved, and retired codes', async () => {
    const { service, db } = setup();
    db.referralCode.findUnique.mockResolvedValue({ retiredAt: null, partner: { status: 'SUSPENDED' } });
    expect(await service.lookup('MD23ABCDEF')).toEqual({ valid: false });
    db.referralCode.findUnique.mockResolvedValue({ retiredAt: new Date(), partner: { status: 'APPROVED' } });
    expect(await service.lookup('MD23ABCDEF')).toEqual({ valid: false });
  });

  it('admin changes require a reason', async () => {
    const { service } = setup({ existing: true });
    await expect(service.adminSetStatus('u1', 'REVOKE', ' ', { sub: 'a1', email: 'a@test' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('admin assign refuses a patient who already has a referral', async () => {
    const { service } = setup({ existing: true });
    await expect(service.adminAssign('u1', 'p2', 'phone booking', { sub: 'a1', email: 'a@test' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reassign records from/to partner in history and audit', async () => {
    const { service, db } = setup({ existing: true });
    jest.spyOn(service, 'adminFindPatient').mockResolvedValue({} as never);
    await service.adminReassign('u1', 'p2', 'patient confirmed Dr P2 referred them', { sub: 'a1', email: 'a@test' });
    expect(db.patientReferralEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'REASSIGNED', fromPartnerId: 'p0', toPartnerId: 'p2', actorType: 'ADMIN' }) });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REFERRAL_REASSIGN' }) });
  });

  it('status changes are conditional: a concurrent change loses with 409', async () => {
    const { service, db } = setup({ existing: true });
    db.patientReferral.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.adminSetStatus('u1', 'DISPUTE', 'patient says no', { sub: 'a1', email: 'a@test' })).rejects.toBeInstanceOf(ConflictException);
    expect(db.patientReferralEvent.create).not.toHaveBeenCalled();
  });

  it('partner kit only for approved partners; issues a code once', async () => {
    const { service, db } = setup();
    db.referralPartner.findUnique.mockResolvedValueOnce({ status: 'PENDING' });
    await expect(service.partnerKit('p1')).rejects.toBeInstanceOf(BadRequestException);
    db.referralPartner.findUnique.mockResolvedValueOnce({ status: 'APPROVED' });
    db.referralCode.findFirst.mockResolvedValueOnce(null);
    db.referralCode.create.mockResolvedValueOnce({ code: 'MD23ABCDEF', issuedAt: new Date() });
    const kit = await service.partnerKit('p1');
    expect(kit.link).toBe('https://mdpathlabs.test/r/MD23ABCDEF');
    expect(kit.qrLink).toBe('https://mdpathlabs.test/r/MD23ABCDEF?src=qr');
    expect(kit.qrPngDataUrl).toMatch(/^data:image\/png/);
    expect(JSON.stringify(kit)).not.toMatch(/phone|name/i);
  });
});
