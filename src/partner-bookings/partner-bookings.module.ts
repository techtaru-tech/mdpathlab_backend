import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { FeatureSwitchesModule } from '../partners/feature-switches.js';
import { PartnerAuthGuard } from '../partners/partner-auth.guard.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { PartnerBookingsController } from './partner-bookings.controller.js';
import { PartnerBookingsService } from './partner-bookings.service.js';

/** Partner portal: book tests for a patient with the patient's OTP (pay on collection). */
@Module({
  imports: [AuthModule, OrdersModule, FeatureSwitchesModule],
  controllers: [PartnerBookingsController],
  providers: [PartnerBookingsService, PartnerAuthGuard, PartnersEnabledGuard],
})
export class PartnerBookingsModule {}
