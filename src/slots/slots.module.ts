import { Controller, Get, Module, Query } from '@nestjs/common';
import { GetSlotsDto } from './dto/get-slots.dto.js';
import { SlotsService } from './slots.service.js';

@Controller('slots')
class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list(@Query() dto: GetSlotsDto) {
    return this.slots.getAvailability(dto.date, dto.collectionType, dto.collectionCenterId);
  }
}

@Module({
  controllers: [SlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
