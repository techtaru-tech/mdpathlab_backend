import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminPatientsController } from './admin-patients.controller.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminPhlebotomistsController } from './admin-phlebotomists.controller.js';
import { AdminCollectionCentersController } from './admin-collection-centers.controller.js';

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
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminPatientsController,
    AdminOrdersController,
    AdminPhlebotomistsController,
    AdminCollectionCentersController,
  ],
  providers: [AdminAuthService, AdminAuthGuard],
})
export class AdminModule {}
