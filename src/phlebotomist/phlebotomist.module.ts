import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PhlebotomistOrdersController } from './phlebotomist-orders.controller.js';
import { PhlebotomistOrdersService } from './phlebotomist-orders.service.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PhlebotomistOrdersController],
  providers: [PhlebotomistOrdersService],
})
export class PhlebotomistModule {}
