import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { LabsModule } from '../labs/labs.module.js';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Module({
  imports: [AuthModule, NotificationsModule, LabsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
