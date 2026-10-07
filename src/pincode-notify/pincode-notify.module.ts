import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailModule } from '../mail/mail.module.js';
import { PincodeNotifyController } from './pincode-notify.controller.js';
import { PincodeNotifyService } from './pincode-notify.service.js';

@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [PincodeNotifyController],
  providers: [PincodeNotifyService],
  exports: [PincodeNotifyService],
})
export class PincodeNotifyModule {}
