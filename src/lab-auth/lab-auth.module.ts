import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LabAuthController } from './lab-auth.controller.js';
import { LabAuthService } from './lab-auth.service.js';
import { LabAuthGuard } from './lab-auth.guard.js';

// Same secret as the other three realms, but every lab token carries type:'lab' — each realm's
// guard checks its own claim, so a token from one realm is never accepted by another's routes
// (identical convention to AdminModule/AuthModule).
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_SECRET'),
    signOptions: { expiresIn: Number(config.get('ADMIN_JWT_EXPIRES_IN_HOURS', 12)) * 60 * 60 },
  }),
});

@Module({
  imports: [jwtModule],
  controllers: [LabAuthController],
  providers: [LabAuthService, LabAuthGuard],
  // Re-exporting JwtModule (not just the guard) so LabModule, which only imports LabAuthModule
  // to use LabAuthGuard, also gets JwtService in scope for that guard's own dependency.
  exports: [jwtModule, LabAuthGuard],
})
export class LabAuthModule {}
