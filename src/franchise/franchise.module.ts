import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FranchiseController } from './franchise.controller.js';
import { FranchiseService } from './franchise.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [FranchiseController],
  providers: [FranchiseService],
})
export class FranchiseModule {}
