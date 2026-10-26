import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SmsModule } from '../sms/sms.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { FeatureSwitchesModule } from './feature-switches.js';
import { PartnersEnabledGuard } from './partners-feature.js';
import { PartnerAuthGuard } from './partner-auth.guard.js';
import { PartnerOtpService } from './partner-otp.service.js';
import { PartnersService } from './partners.service.js';
import { PartnerRequirementsService } from './partner-requirements.service.js';
import { PartnerAffiliationsService } from './partner-affiliations.service.js';
import { PartnerEmails } from './partner-emails.js';
import { PartnerAuthController, PartnersPublicController } from './partner-auth.controller.js';
import { PartnerPortalController } from './partner-portal.controller.js';
import { AdminAffiliationsController, AdminPartnersController } from './admin/admin-partners.controller.js';
import { AdminPartnerSettingsController } from './admin/admin-partner-settings.controller.js';
import { AdminPermissionGuard } from './admin/admin-permission.guard.js';

// Same secret as the other realms, but every partner token carries type:'partner' — each realm's guard checks its
// own claim, so a token from one realm is never accepted by another's routes (same convention as LabAuthModule,
// including its 12-hour lifetime).
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_SECRET'),
    signOptions: { expiresIn: Number(config.get('ADMIN_JWT_EXPIRES_IN_HOURS', 12)) * 60 * 60 },
  }),
});

/**
 * Doctor & clinic ("referral partner") registration and verification — Phase 1. Self-contained: no global guard,
 * interceptor or middleware is registered here, and no existing module imports anything from it, so with doctor
 * registration switched off every existing route behaves exactly as before.
 */
@Module({
  imports: [jwtModule, SmsModule, MailModule, NotificationsModule, FeatureSwitchesModule],
  controllers: [
    PartnersPublicController,
    PartnerAuthController,
    PartnerPortalController,
    AdminPartnersController,
    AdminAffiliationsController,
    AdminPartnerSettingsController,
  ],
  providers: [
    PartnerOtpService,
    PartnersService,
    PartnerRequirementsService,
    PartnerAffiliationsService,
    PartnerEmails,
    PartnersEnabledGuard,
    PartnerAuthGuard,
    AdminAuthGuard,
    AdminPermissionGuard,
  ],
})
export class PartnersModule {}
