import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
