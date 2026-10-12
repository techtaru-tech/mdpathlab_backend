import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { RazorpayGateway } from './razorpay-gateway.service.js';

@Module({
  imports: [SettingsModule],
  providers: [RazorpayGateway],
  exports: [RazorpayGateway],
})
export class RazorpayGatewayModule {}
