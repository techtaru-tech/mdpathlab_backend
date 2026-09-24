import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PincodeNotifyService } from './pincode-notify.service.js';
import { CreatePincodeNotifyRequestDto } from './dto/create-pincode-notify-request.dto.js';

@Controller('pincode-notify-requests')
export class PincodeNotifyController {
  constructor(private readonly pincodeNotify: PincodeNotifyService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreatePincodeNotifyRequestDto) {
    return this.pincodeNotify.create(dto);
  }
}
