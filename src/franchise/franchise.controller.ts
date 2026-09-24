import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FranchiseService } from './franchise.service.js';
import { CreateFranchiseInquiryDto } from './dto/create-franchise-inquiry.dto.js';

@Controller('franchise-inquiries')
export class FranchiseController {
  constructor(private readonly franchise: FranchiseService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateFranchiseInquiryDto) {
    return this.franchise.create(dto);
  }
}
