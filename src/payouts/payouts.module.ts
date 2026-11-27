import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { FeatureSwitchesModule } from '../partners/feature-switches.js';
import { PartnerAuthGuard } from '../partners/partner-auth.guard.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { AdminPermissionGuard } from '../partners/admin/admin-permission.guard.js';
import { BankCrypto } from './bank-crypto.js';
import { PayoutEmails } from './payout-emails.js';
import { PayoutsService } from './payouts.service.js';
import { CommissionSweeper } from './commission.sweeper.js';
import { PartnerMouService } from './partner-mou.service.js';
import { PartnerOtpService } from '../partners/partner-otp.service.js';
import { SmsModule } from '../sms/sms.module.js';
import { AdminPayoutsController, PartnerEarningsController } from './payouts.controller.js';

/**
 * Partner earnings and payouts. Self-contained like PartnersModule and ReferralsModule: no global guard,
 * interceptor or middleware, nothing exported, and no booking/payment/report module imports it. Built switched
 * off — no commission is calculated until an admin enables it in Admin → Payouts.
 */
@Module({
  imports: [AuthModule, MailModule, NotificationsModule, FeatureSwitchesModule, SmsModule],
  controllers: [PartnerEarningsController, AdminPayoutsController],
  providers: [BankCrypto, PayoutEmails, PayoutsService, PartnerMouService, PartnerOtpService, CommissionSweeper, PartnersEnabledGuard, PartnerAuthGuard, AdminAuthGuard, AdminPermissionGuard],
})
export class PayoutsModule {}
