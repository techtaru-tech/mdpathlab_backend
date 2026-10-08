import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { PhlebotomistContentController } from './phlebotomist-content.controller.js';
import { PhlebotomistOrdersController } from './phlebotomist-orders.controller.js';
import { PhlebotomistOrdersService } from './phlebotomist-orders.service.js';

@Module({
  imports: [AuthModule, NotificationsModule, MailModule, SettingsModule],
  controllers: [PhlebotomistOrdersController, PhlebotomistContentController],
  providers: [PhlebotomistOrdersService],
})
export class PhlebotomistModule {}
