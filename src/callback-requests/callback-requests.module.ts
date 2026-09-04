import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CallbackRequestsController } from './callback-requests.controller.js';
import { CallbackRequestsService } from './callback-requests.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [CallbackRequestsController],
  providers: [CallbackRequestsService],
})
export class CallbackRequestsModule {}
