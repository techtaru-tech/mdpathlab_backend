import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LabsModule } from '../labs/labs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { MailModule } from '../mail/mail.module.js';
import { HomeVisitsController } from './home-visits.controller.js';
import { HomeVisitsService } from './home-visits.service.js';

@Module({
  imports: [AuthModule, LabsModule, NotificationsModule, OrdersModule, MailModule],
  controllers: [HomeVisitsController],
  providers: [HomeVisitsService],
  exports: [HomeVisitsService],
})
export class HomeVisitsModule {}
