import { PARTNER_TRANSITIONS, canTransition, isApplicationEditable, type PartnerAction, type PartnerStatus } from './partner-status';

const STATUSES: PartnerStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

// The complete allow-list: anything not here must be refused.
const ALLOWED: Record<PartnerAction, PartnerStatus[]> = {
  SUBMIT: ['DRAFT', 'REJECTED'],
  APPROVE: ['PENDING'],
  REJECT: ['PENDING'],
  SUSPEND: ['APPROVED'],
  REACTIVATE: ['SUSPENDED'],
};

describe('partner status transitions', () => {
  for (const action of Object.keys(ALLOWED) as PartnerAction[]) {
    for (const from of STATUSES) {
      const allowed = ALLOWED[action].includes(from);
      it(`${action} from ${from} is ${allowed ? 'allowed' : 'refused'}`, () => {
        expect(canTransition(from, action)).toBe(allowed);
      });
    }
  }

  it('lands on the expected status for each action', () => {
    expect(PARTNER_TRANSITIONS.SUBMIT.to).toBe('PENDING');
    expect(PARTNER_TRANSITIONS.APPROVE.to).toBe('APPROVED');
    expect(PARTNER_TRANSITIONS.REJECT.to).toBe('REJECTED');
    expect(PARTNER_TRANSITIONS.SUSPEND.to).toBe('SUSPENDED');
    expect(PARTNER_TRANSITIONS.REACTIVATE.to).toBe('APPROVED');
  });

  it('requires a reason for reject, suspend and reactivate only', () => {
    expect(PARTNER_TRANSITIONS.REJECT.needsReason).toBe(true);
    expect(PARTNER_TRANSITIONS.SUSPEND.needsReason).toBe(true);
    expect(PARTNER_TRANSITIONS.REACTIVATE.needsReason).toBe(true);
    expect(PARTNER_TRANSITIONS.APPROVE.needsReason).toBe(false);
    expect(PARTNER_TRANSITIONS.SUBMIT.needsReason).toBe(false);
  });

  it('only the partner submits; only an admin decides', () => {
    expect(PARTNER_TRANSITIONS.SUBMIT.by).toBe('PARTNER');
    for (const a of ['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE'] as const) expect(PARTNER_TRANSITIONS[a].by).toBe('ADMIN');
  });

  it('lets the application be edited only as a draft or after rejection', () => {
    expect(STATUSES.filter(isApplicationEditable)).toEqual(['DRAFT', 'REJECTED']);
  });
});
