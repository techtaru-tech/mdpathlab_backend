import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LabsModule } from '../labs/labs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { MailModule } from '../mail/mail.module.js';
import { HomeVisitsController } from './home-visits.controller.js';
import { LabHomeVisitsController, PhlebotomistHomeVisitsController } from './home-visits-staff.controller.js';
import { LabAuthModule } from '../lab-auth/lab-auth.module.js';
import { HomeVisitsService } from './home-visits.service.js';

@Module({
  imports: [AuthModule, LabAuthModule, LabsModule, NotificationsModule, OrdersModule, MailModule],
  controllers: [HomeVisitsController, PhlebotomistHomeVisitsController, LabHomeVisitsController],
  providers: [HomeVisitsService],
  exports: [HomeVisitsService],
})
export class HomeVisitsModule {}
