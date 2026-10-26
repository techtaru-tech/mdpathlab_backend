import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

// The upload folder is created when the storage module loads — not needed to inspect metadata.
jest.mock('./partner-documents', () => ({ partnerDocumentStorage: {} }));

import { PartnersModule } from './partners.module';
import { PartnersEnabledGuard } from './partners-feature';
import { PartnerAuthController } from './partner-auth.controller';
import { PartnerPortalController } from './partner-portal.controller';

describe('PartnersModule stays self-contained', () => {
  it('registers no global guard, interceptor, pipe or filter (existing routes are untouched)', () => {
    const providers: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PartnersModule) ?? [];
    const globalTokens = [APP_GUARD, APP_INTERCEPTOR, APP_PIPE, APP_FILTER];
    for (const p of providers) {
      const token = typeof p === 'object' && p !== null && 'provide' in p ? (p as { provide: unknown }).provide : p;
      expect(globalTokens).not.toContain(token);
    }
  });

  it('exports nothing for other modules to depend on', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PartnersModule) ?? []).toEqual([]);
  });

  it('puts every partner-facing controller behind the feature switch', () => {
    for (const controller of [PartnerAuthController, PartnerPortalController]) {
      const guards: unknown[] = Reflect.getMetadata('__guards__', controller) ?? [];
      expect(guards[0]).toBe(PartnersEnabledGuard);
    }
  });
});
