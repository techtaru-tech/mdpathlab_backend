// The one place that decides which status changes a doctor/clinic application may go through, and who may make
// them. Pure (no database) so every allowed and forbidden pair is covered by a plain unit test.

export type PartnerStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type PartnerAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE';
export type PartnerActor = 'PARTNER' | 'ADMIN';

type Transition = { from: readonly PartnerStatus[]; to: PartnerStatus; by: PartnerActor; needsReason: boolean; event: string };

export const PARTNER_TRANSITIONS: Record<PartnerAction, Transition> = {
  // A rejected application is corrected and sent again — there is no separate "request more information" state.
  SUBMIT: { from: ['DRAFT', 'REJECTED'], to: 'PENDING', by: 'PARTNER', needsReason: false, event: 'SUBMITTED' },
  APPROVE: { from: ['PENDING'], to: 'APPROVED', by: 'ADMIN', needsReason: false, event: 'APPROVED' },
  REJECT: { from: ['PENDING'], to: 'REJECTED', by: 'ADMIN', needsReason: true, event: 'REJECTED' },
  SUSPEND: { from: ['APPROVED'], to: 'SUSPENDED', by: 'ADMIN', needsReason: true, event: 'SUSPENDED' },
  REACTIVATE: { from: ['SUSPENDED'], to: 'APPROVED', by: 'ADMIN', needsReason: true, event: 'REACTIVATED' },
};

export function canTransition(from: PartnerStatus, action: PartnerAction): boolean {
  return PARTNER_TRANSITIONS[action].from.includes(from);
}

/** Profile and documents can be changed only before submission, or after a rejection. */
export function isApplicationEditable(status: PartnerStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/** Affiliations (and later, referral tools) are for approved partners only. */
export function isApproved(status: PartnerStatus): boolean {
  return status === 'APPROVED';
}
