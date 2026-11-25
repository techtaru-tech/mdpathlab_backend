import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FirebaseService } from './firebase.service.js';
import { NotificationsService } from './notifications.service.js';
import { DeviceTokensController } from './device-tokens.controller.js';
import { PhlebotomistDeviceTokensController } from './phlebotomist-device-tokens.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { MessageTemplatesService } from './message-templates.js';

@Module({
  imports: [AuthModule],
  controllers: [DeviceTokensController, PhlebotomistDeviceTokensController, NotificationsController],
  providers: [FirebaseService, NotificationsService, MessageTemplatesService],
  exports: [NotificationsService, MessageTemplatesService],
})
export class NotificationsModule {}
