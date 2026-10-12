import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CareersController } from './careers.controller.js';
import { CareersService } from './careers.service.js';

// The public controller lives here; AdminCareersController and LabCareersController are registered in AdminModule
// and LabModule, which carry the JWT setup their guards need.
@Module({
  imports: [NotificationsModule],
  controllers: [CareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
