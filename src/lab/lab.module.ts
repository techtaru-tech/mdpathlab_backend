import { Module } from '@nestjs/common';
import { LabAuthModule } from '../lab-auth/lab-auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailModule } from '../mail/mail.module.js';
import { PhlebotomistSchedulingModule } from '../phlebotomist/phlebotomist-scheduling.module.js';
import { LabOrdersController } from './lab-orders.controller.js';
import { LabOrdersService } from './lab-orders.service.js';
import { LabPhlebotomistsController } from './lab-phlebotomists.controller.js';
import { LabResultsController } from './lab-results.controller.js';
import { LabResultsService } from './lab-results.service.js';
import { LabCatalogueController } from './lab-catalogue.controller.js';
import { LabPrescriptionsController } from './lab-prescriptions.controller.js';
import { LabServiceAreasController } from './lab-service-areas.controller.js';

@Module({
  imports: [LabAuthModule, NotificationsModule, PhlebotomistSchedulingModule, MailModule],
  controllers: [LabOrdersController, LabPhlebotomistsController, LabResultsController, LabCatalogueController, LabPrescriptionsController, LabServiceAreasController],
  providers: [LabOrdersService, LabResultsService],
})
export class LabModule {}
