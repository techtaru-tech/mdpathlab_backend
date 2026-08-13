import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { CartModule } from './cart/cart.module.js';
import { SlotsModule } from './slots/slots.module.js';
import { CouponsModule } from './coupons/coupons.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { OffersModule } from './offers/offers.module.js';
import { CollectionCentersModule } from './collection-centers/collection-centers.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 60 }] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CatalogueModule,
    PatientsModule,
    CartModule,
    SlotsModule,
    CouponsModule,
    OrdersModule,
    PaymentsModule,
    OffersModule,
    CollectionCentersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
