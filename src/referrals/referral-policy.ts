// The attribution rules, kept pure (no database) so every case is a plain unit test.

/** Recorded on every binding and snapshot, so a later policy change never re-interprets old data. */
export const REFERRAL_POLICY_VERSION = '2026-10-v1';

export type ReferralStatus = 'ACTIVE' | 'DISPUTED' | 'REVOKED';
export type PartnerStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ClaimOutcome = 'BOUND' | 'ALREADY_REFERRED' | 'EXISTING_CUSTOMER' | 'SELF_REFERRAL' | 'PARTNER_NOT_ACTIVE' | 'INVALID_CODE';

/**
 * Can this patient be linked to this partner now? Order of checks matters only for which reason is logged; the
 * patient always gets a neutral answer. "Genuinely new" = no order of ANY status, cancelled ones included.
 */
export function decideClaim(input: {
  alreadyReferred: boolean;
  code: { retired: boolean } | null;
  partner: { status: PartnerStatus; phone: string } | null;
  patientPhone: string;
  orderCount: number;
}): ClaimOutcome {
  if (input.alreadyReferred) return 'ALREADY_REFERRED';
  if (!input.code || input.code.retired || !input.partner) return 'INVALID_CODE';
  if (input.partner.status !== 'APPROVED') return 'PARTNER_NOT_ACTIVE';
  if (input.partner.phone === input.patientPhone) return 'SELF_REFERRAL';
  if (input.orderCount > 0) return 'EXISTING_CUSTOMER';
  return 'BOUND';
}

/** What the patient is told: never which check failed (that would leak partner/account facts). */
export function publicClaimStatus(outcome: ClaimOutcome): 'BOUND' | 'ALREADY_REFERRED' | 'NOT_ELIGIBLE' | 'INVALID' {
  if (outcome === 'BOUND' || outcome === 'ALREADY_REFERRED') return outcome;
  if (outcome === 'INVALID_CODE') return 'INVALID';
  return 'NOT_ELIGIBLE';
}

export type ReferralEventLike = {
  event: string;
  toPartnerId: string | null;
  toStatus: ReferralStatus | null;
  createdAt: Date;
};

/**
 * Which partner the patient was attributed to, and with what status, at instant `at` — replayed from the
 * append-only history. Returns null if the binding happened after `at` (such an order is never attributed).
 */
export function referralStateAt(events: ReferralEventLike[], at: Date): { partnerId: string; status: ReferralStatus } | null {
  let state: { partnerId: string; status: ReferralStatus } | null = null;
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.createdAt.getTime() > at.getTime()) break;
    if (e.event === 'BOUND' && e.toPartnerId) {
      state = { partnerId: e.toPartnerId, status: e.toStatus ?? 'ACTIVE' };
      continue;
    }
    if (!state) continue;
    if (e.toPartnerId) state = { ...state, partnerId: e.toPartnerId };
    if (e.toStatus) state = { ...state, status: e.toStatus };
  }
  return state;
}

/** A partner's status at instant `at`, from their status history; `current` if nothing is recorded before it. */
export function partnerStatusAt(
  events: { toStatus: PartnerStatus | null; createdAt: Date }[],
  at: Date,
  current: PartnerStatus,
): PartnerStatus {
  let status: PartnerStatus | null = null;
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.createdAt.getTime() > at.getTime()) break;
    if (e.toStatus) status = e.toStatus;
  }
  return status ?? current;
}
