import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SmsModule } from '../sms/sms.module.js';
import { PaymentsController, RazorpayWebhookController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { OrdersModule } from '../orders/orders.module.js';
import { RazorpayGatewayModule } from './razorpay-gateway.module.js';

@Module({
  imports: [AuthModule, SettingsModule, MailModule, SmsModule, NotificationsModule, OrdersModule, RazorpayGatewayModule],
  controllers: [PaymentsController, RazorpayWebhookController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
