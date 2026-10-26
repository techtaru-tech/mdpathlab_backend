import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

jest.mock('qrcode', () => ({ toDataURL: jest.fn() }), { virtual: true });

import { ReferralsModule } from './referrals.module';
import { ReferralsEnabledGuard } from './referrals-feature';
import { PartnerReferralKitController, PatientReferralController, ReferralsPublicController } from './referrals.controller';
import { PartnersEnabledGuard } from '../partners/partners-feature';

describe('ReferralsModule', () => {
  it('registers no global guard, interceptor, pipe or filter and exports nothing', () => {
    const providers: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ReferralsModule) ?? [];
    for (const p of providers) {
      const token = typeof p === 'object' && p !== null && 'provide' in p ? (p as { provide: unknown }).provide : p;
      expect([APP_GUARD, APP_INTERCEPTOR, APP_PIPE, APP_FILTER]).not.toContain(token);
    }
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ReferralsModule) ?? []).toEqual([]);
  });

  it('every public/patient/partner referral controller checks the switch first', () => {
    for (const c of [ReferralsPublicController, PatientReferralController]) {
      expect((Reflect.getMetadata('__guards__', c) ?? [])[0]).toBe(ReferralsEnabledGuard);
    }
    const kit = Reflect.getMetadata('__guards__', PartnerReferralKitController) ?? [];
    expect(kit.slice(0, 2)).toEqual([PartnersEnabledGuard, ReferralsEnabledGuard]);
  });
});
