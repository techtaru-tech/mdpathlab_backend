import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAdminAudit, type AdminActor } from './admin/admin-audit.js';

export type FeatureSwitchState = { referralPartnersEnabled: boolean; referralsEnabled: boolean };

const OFF: FeatureSwitchState = { referralPartnersEnabled: false, referralsEnabled: false };
// The guards read the switches on every partner/referral request; a short cache keeps that to one tiny query per
// 10 s. A change made through set() applies at once in this process and within 10 s in any other.
const CACHE_MS = 10_000;
const SELECT = { id: true, referralPartnersEnabled: true, referralsEnabled: true } as const;

/**
 * The two admin switches (Admin → Settings → Doctors & Referrals), stored on the single SiteSetting row. Both
 * default to off, so deploying this changes nothing until an admin turns them on. If the row can't be read, the
 * last known state is used (off if there is none) — a database hiccup never turns a feature on.
 */
@Injectable()
export class FeatureSwitches {
  private readonly logger = new Logger('FeatureSwitches');
  private cached: { state: FeatureSwitchState; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<FeatureSwitchState> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.state;
    try {
      const row = await this.prisma.siteSetting.findFirst({ select: SELECT });
      const state = row ? { referralPartnersEnabled: row.referralPartnersEnabled, referralsEnabled: row.referralsEnabled } : OFF;
      this.cached = { state, at: Date.now() };
      return state;
    } catch (err) {
      this.logger.error(`Could not read the feature switches: ${(err as Error).message}`);
      return this.cached?.state ?? OFF;
    }
  }

  async partnersEnabled(): Promise<boolean> {
    return (await this.get()).referralPartnersEnabled;
  }

  async referralsEnabled(): Promise<boolean> {
    return (await this.get()).referralsEnabled;
  }

  /** Admin change; audited when anything actually changes. */
  async set(patch: Partial<FeatureSwitchState>, admin: AdminActor): Promise<FeatureSwitchState> {
    const data = {
      ...(patch.referralPartnersEnabled !== undefined ? { referralPartnersEnabled: patch.referralPartnersEnabled } : {}),
      ...(patch.referralsEnabled !== undefined ? { referralsEnabled: patch.referralsEnabled } : {}),
    };
    const state = await this.prisma.$transaction(async (tx) => {
      // Same "always exactly one row" rule as SettingsService.getOrCreate.
      const row = (await tx.siteSetting.findFirst({ select: SELECT })) ?? (await tx.siteSetting.create({ data: {}, select: SELECT }));
      const before = { referralPartnersEnabled: row.referralPartnersEnabled, referralsEnabled: row.referralsEnabled };
      const updated = await tx.siteSetting.update({ where: { id: row.id }, data, select: SELECT });
      const after = { referralPartnersEnabled: updated.referralPartnersEnabled, referralsEnabled: updated.referralsEnabled };
      if (before.referralPartnersEnabled !== after.referralPartnersEnabled || before.referralsEnabled !== after.referralsEnabled) {
        await writeAdminAudit(tx, admin, { action: 'FEATURE_SWITCHES_UPDATE', entityType: 'SiteSetting', entityId: row.id, before, after });
      }
      return after;
    });
    this.cached = { state, at: Date.now() };
    return state;
  }
}

/** Shared by PartnersModule and ReferralsModule so both read (and the admin screen updates) one cache. */
@Module({
  providers: [FeatureSwitches],
  exports: [FeatureSwitches],
})
export class FeatureSwitchesModule {}
