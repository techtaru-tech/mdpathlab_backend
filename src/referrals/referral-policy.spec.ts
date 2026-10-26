import { decideClaim, partnerStatusAt, publicClaimStatus, referralStateAt } from './referral-policy';
import { REFERRAL_CODE_PATTERN, generateReferralCode, normalizeReferralCode, referralLink } from './referral-code';

const ok = { alreadyReferred: false, code: { retired: false }, partner: { status: 'APPROVED' as const, phone: '9000000001' }, patientPhone: '9000000002', orderCount: 0 };

describe('decideClaim — who can be linked', () => {
  it('binds a genuinely new patient to an approved partner', () => expect(decideClaim(ok)).toBe('BOUND'));
  it('never replaces an existing referral', () => expect(decideClaim({ ...ok, alreadyReferred: true })).toBe('ALREADY_REFERRED'));
  it('refuses an unknown or retired code', () => {
    expect(decideClaim({ ...ok, code: null, partner: null })).toBe('INVALID_CODE');
    expect(decideClaim({ ...ok, code: { retired: true } })).toBe('INVALID_CODE');
  });
  it('refuses a partner that is not approved (suspended, pending, rejected)', () => {
    for (const status of ['SUSPENDED', 'PENDING', 'REJECTED', 'DRAFT'] as const) {
      expect(decideClaim({ ...ok, partner: { ...ok.partner, status } })).toBe('PARTNER_NOT_ACTIVE');
    }
  });
  it('refuses self-referral (patient number = partner number)', () => expect(decideClaim({ ...ok, patientPhone: '9000000001' })).toBe('SELF_REFERRAL'));
  it('refuses anyone with an order of any status, cancelled included', () => expect(decideClaim({ ...ok, orderCount: 1 })).toBe('EXISTING_CUSTOMER'));
  it('tells the patient only a neutral status', () => {
    expect(publicClaimStatus('SELF_REFERRAL')).toBe('NOT_ELIGIBLE');
    expect(publicClaimStatus('EXISTING_CUSTOMER')).toBe('NOT_ELIGIBLE');
    expect(publicClaimStatus('PARTNER_NOT_ACTIVE')).toBe('NOT_ELIGIBLE');
    expect(publicClaimStatus('INVALID_CODE')).toBe('INVALID');
  });
});

const at = (min: number) => new Date(Date.UTC(2026, 9, 23, 10, min));

describe('referralStateAt — attribution as it was when the order was placed', () => {
  const events = [
    { event: 'BOUND', toPartnerId: 'p1', toStatus: 'ACTIVE' as const, createdAt: at(0) },
    { event: 'DISPUTED', toPartnerId: null, toStatus: 'DISPUTED' as const, createdAt: at(10) },
    { event: 'RESTORED', toPartnerId: null, toStatus: 'ACTIVE' as const, createdAt: at(20) },
    { event: 'REASSIGNED', toPartnerId: 'p2', toStatus: null, createdAt: at(30) },
    { event: 'REVOKED', toPartnerId: null, toStatus: 'REVOKED' as const, createdAt: at(40) },
  ];
  it('returns nothing before the binding', () => expect(referralStateAt(events, new Date(at(0).getTime() - 1))).toBeNull());
  it('replays each change in order', () => {
    expect(referralStateAt(events, at(5))).toEqual({ partnerId: 'p1', status: 'ACTIVE' });
    expect(referralStateAt(events, at(15))).toEqual({ partnerId: 'p1', status: 'DISPUTED' });
    expect(referralStateAt(events, at(25))).toEqual({ partnerId: 'p1', status: 'ACTIVE' });
    expect(referralStateAt(events, at(35))).toEqual({ partnerId: 'p2', status: 'ACTIVE' });
    expect(referralStateAt(events, at(45))).toEqual({ partnerId: 'p2', status: 'REVOKED' });
  });
  it('does not depend on the order events are passed in', () => expect(referralStateAt([...events].reverse(), at(35))).toEqual({ partnerId: 'p2', status: 'ACTIVE' }));
});

describe('partnerStatusAt', () => {
  const hist = [
    { toStatus: 'APPROVED' as const, createdAt: at(0) },
    { toStatus: 'SUSPENDED' as const, createdAt: at(10) },
    { toStatus: 'APPROVED' as const, createdAt: at(20) },
  ];
  it('uses the status in force at that instant', () => {
    expect(partnerStatusAt(hist, at(5), 'APPROVED')).toBe('APPROVED');
    expect(partnerStatusAt(hist, at(15), 'APPROVED')).toBe('SUSPENDED');
    expect(partnerStatusAt(hist, at(25), 'SUSPENDED')).toBe('APPROVED');
  });
});

describe('referral codes', () => {
  it('generates MD + 8 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateReferralCode()).toMatch(REFERRAL_CODE_PATTERN);
    expect(new Set(Array.from({ length: 500 }, generateReferralCode)).size).toBe(500);
  });
  it('normalises what people type, and rejects anything else', () => {
    expect(normalizeReferralCode(' md-23ab cdef ')).toBe('MD23ABCDEF');
    expect(normalizeReferralCode('MD0OIL1UXX')).toBeNull();
    expect(normalizeReferralCode('../../etc')).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });
  it('builds link and QR link from the public app URL', () => {
    expect(referralLink('https://mdpathlabs.com/', 'MD23ABCDEF')).toBe('https://mdpathlabs.com/r/MD23ABCDEF');
    expect(referralLink('https://mdpathlabs.com', 'MD23ABCDEF', 'QR')).toBe('https://mdpathlabs.com/r/MD23ABCDEF?src=qr');
  });
});
