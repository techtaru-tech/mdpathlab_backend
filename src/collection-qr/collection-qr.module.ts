import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RazorpayGatewayModule } from '../payments/razorpay-gateway.module.js';
import { CollectionQrController } from './collection-qr.controller.js';
import { CollectionQrService } from './collection-qr.service.js';

@Module({
  imports: [AuthModule, MailModule, NotificationsModule, RazorpayGatewayModule],
  controllers: [CollectionQrController],
  providers: [CollectionQrService],
  exports: [CollectionQrService],
})
export class CollectionQrModule {}
