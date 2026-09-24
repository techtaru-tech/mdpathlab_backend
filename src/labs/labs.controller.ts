import { Body, Controller, Post } from '@nestjs/common';
import { LabsService } from './labs.service.js';
import { CheckServiceabilityDto } from './dto/check-serviceability.dto.js';

@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Post('serviceability')
  check(@Body() dto: CheckServiceabilityDto) {
    return this.labs.checkServiceability(dto.pincode, dto.items ?? []);
  }
}
