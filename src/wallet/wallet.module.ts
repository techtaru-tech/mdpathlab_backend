import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [AuthModule, SettingsModule, NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
