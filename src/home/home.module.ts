import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { HomeController } from './home.controller.js';

@Module({
  imports: [CatalogueModule, OffersModule, CouponsModule],
  controllers: [HomeController],
})
export class HomeModule {}
