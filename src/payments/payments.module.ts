import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { MailModule } from '../mail/mail.module.js';
import { PaymentsController, RazorpayWebhookController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuthModule, SettingsModule, MailModule],
  controllers: [PaymentsController, RazorpayWebhookController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
