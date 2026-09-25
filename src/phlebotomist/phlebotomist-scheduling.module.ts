import { Module } from '@nestjs/common';
import { PhlebotomistSchedulingService } from './phlebotomist-scheduling.service.js';

// Split out from PhlebotomistModule so lab/admin modules can use the scheduling check without
// pulling in the phlebotomist-facing controller/guard as well.
@Module({
  providers: [PhlebotomistSchedulingService],
  exports: [PhlebotomistSchedulingService],
})
export class PhlebotomistSchedulingModule {}
