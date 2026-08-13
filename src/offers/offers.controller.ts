import { Controller, Get } from '@nestjs/common';
import { OffersService } from './offers.service.js';

@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list() {
    return this.offers.listActive();
  }
}
