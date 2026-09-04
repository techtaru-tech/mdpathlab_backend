import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CallbackRequestsService } from './callback-requests.service.js';
import { CreateCallbackRequestDto } from './dto/create-callback-request.dto.js';

@Controller('callback-requests')
export class CallbackRequestsController {
  constructor(private readonly callbackRequests: CallbackRequestsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateCallbackRequestDto) {
    return this.callbackRequests.create(dto);
  }
}
