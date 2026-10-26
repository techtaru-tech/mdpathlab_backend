import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { PartnerAuthGuard } from '../partners/partner-auth.guard.js';
import { FeatureSwitchesModule } from '../partners/feature-switches.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { AdminPermissionGuard } from '../partners/admin/admin-permission.guard.js';
import { ReferralsEnabledGuard } from './referrals-feature.js';
import { ReferralsService } from './referrals.service.js';
import { ReferralSnapshotSweeper } from './referral-snapshot.sweeper.js';
import { PartnerReferralKitController, PatientReferralController, ReferralsPublicController } from './referrals.controller.js';
import { AdminReferralsController } from './admin-referrals.controller.js';

/**
 * Referral links and lifetime attribution — Phase 2. Self-contained like PartnersModule: no global guard,
 * interceptor or middleware, nothing exported, and no booking/checkout/payment module imports it. AuthModule is
 * imported only for JwtAuthGuard and the shared JwtService (same secret; each guard checks its own token type).
 */
@Module({
  imports: [AuthModule, NotificationsModule, FeatureSwitchesModule],
  controllers: [ReferralsPublicController, PatientReferralController, PartnerReferralKitController, AdminReferralsController],
  providers: [ReferralsService, ReferralSnapshotSweeper, ReferralsEnabledGuard, PartnersEnabledGuard, PartnerAuthGuard, AdminAuthGuard, AdminPermissionGuard],
})
export class ReferralsModule {}
