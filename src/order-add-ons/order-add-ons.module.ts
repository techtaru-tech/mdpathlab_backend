import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PatientOrderAddOnsController, PhlebotomistOrderAddOnsController } from './order-add-ons.controller.js';
import { OrderAddOnsService } from './order-add-ons.service.js';

@Module({
  imports: [AuthModule, CatalogueModule, NotificationsModule, MailModule],
  controllers: [PatientOrderAddOnsController, PhlebotomistOrderAddOnsController],
  providers: [OrderAddOnsService],
})
export class OrderAddOnsModule {}
