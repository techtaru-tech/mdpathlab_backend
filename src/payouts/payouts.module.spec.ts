import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { PayoutsModule } from './payouts.module';
import { AdminPayoutsController, PartnerEarningsController } from './payouts.controller';
import { PartnersEnabledGuard } from '../partners/partners-feature';
import { PartnerAuthGuard } from '../partners/partner-auth.guard';

describe('PayoutsModule stays self-contained', () => {
  it('registers no global guard, interceptor, pipe or filter and exports nothing', () => {
    const providers: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PayoutsModule) ?? [];
    for (const p of providers) {
      const token = typeof p === 'object' && p !== null && 'provide' in p ? (p as { provide: unknown }).provide : p;
      expect([APP_GUARD, APP_INTERCEPTOR, APP_PIPE, APP_FILTER]).not.toContain(token);
    }
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PayoutsModule) ?? []).toEqual([]);
  });

  it('partner earnings need the portal switch and a partner login; admin routes an admin login', () => {
    expect((Reflect.getMetadata('__guards__', PartnerEarningsController) ?? []).slice(0, 2)).toEqual([PartnersEnabledGuard, PartnerAuthGuard]);
    expect((Reflect.getMetadata('__guards__', AdminPayoutsController) ?? []).length).toBe(2);
  });

  // Commission can never fail or slow a booking, a payment, a report or a cancellation: none of that code knows it exists.
  it.each(['orders', 'payments', 'cart', 'order-add-ons', 'home-visits', 'auth', 'lab', 'phlebotomist'])('src/%s does not import payouts', (dir) => {
    const root = join(__dirname, '..', dir);
    for (const f of readdirSync(root).filter((n) => n.endsWith('.ts'))) {
      expect(readFileSync(join(root, f), 'utf8')).not.toMatch(/payouts\//);
    }
  });
});
