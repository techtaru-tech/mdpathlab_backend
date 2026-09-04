import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FirebaseService } from './firebase.service.js';
import { NotificationsService } from './notifications.service.js';
import { DeviceTokensController } from './device-tokens.controller.js';
import { PhlebotomistDeviceTokensController } from './phlebotomist-device-tokens.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DeviceTokensController, PhlebotomistDeviceTokensController],
  providers: [FirebaseService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
