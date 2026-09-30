import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { HomeController } from './home.controller.js';

@Module({
  imports: [CatalogueModule, CouponsModule],
  controllers: [HomeController],
})
export class HomeModule {}
