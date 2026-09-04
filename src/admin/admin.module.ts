import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SlotsModule } from '../slots/slots.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminPatientsController } from './admin-patients.controller.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminPhlebotomistsController } from './admin-phlebotomists.controller.js';
import { AdminCollectionCentersController } from './admin-collection-centers.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminOffersController } from './admin-offers.controller.js';
import { AdminSlotsController } from './admin-slots.controller.js';
import { AdminSlotAvailabilityController } from './admin-slot-availability.controller.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminParametersController } from './admin-parameters.controller.js';
import { AdminTestsController } from './admin-tests.controller.js';
import { AdminPackagesController } from './admin-packages.controller.js';
import { AdminBlogController } from './admin-blog.controller.js';
import { AdminSettingsController } from './admin-settings.controller.js';
import { AdminContactQueriesController } from './admin-contact-queries.controller.js';
import { AdminCitiesController } from './admin-cities.controller.js';
import { AdminCallbackRequestsController } from './admin-callback-requests.controller.js';
import { AdminPrescriptionsController } from './admin-prescriptions.controller.js';
import { AdminCouponsController } from './admin-coupons.controller.js';
import { AdminDeviceTokensController } from './admin-device-tokens.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CatalogueValidationService } from './catalogue-validation.service.js';

@Module({
  imports: [
    // Same secret as the patient JwtModule, but every admin token carries type:'admin' and every
    // patient token carries type:'patient' — the two guards each check their own claim, so a
    // token from one realm is never accepted by the other's routes.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: Number(config.get('ADMIN_JWT_EXPIRES_IN_HOURS', 12)) * 60 * 60 },
      }),
    }),
    SlotsModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminPatientsController,
    AdminOrdersController,
    AdminPhlebotomistsController,
    AdminCollectionCentersController,
    AdminReportsController,
    AdminOffersController,
    AdminSlotsController,
    AdminSlotAvailabilityController,
    AdminCategoriesController,
    AdminParametersController,
    AdminTestsController,
    AdminPackagesController,
    AdminBlogController,
    AdminSettingsController,
    AdminContactQueriesController,
    AdminCitiesController,
    AdminCallbackRequestsController,
    AdminPrescriptionsController,
    AdminCouponsController,
    AdminDeviceTokensController,
  ],
  providers: [AdminAuthService, AdminAuthGuard, CatalogueValidationService],
})
export class AdminModule {}
