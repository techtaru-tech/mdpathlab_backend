import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { SlotsModule } from '../slots/slots.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule, CatalogueModule, CouponsModule, SlotsModule, SettingsModule, NotificationsModule, WalletModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
