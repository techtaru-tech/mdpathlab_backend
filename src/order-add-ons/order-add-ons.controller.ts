import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { RequestAddOnDto } from './dto/request-add-on.dto.js';
import { OrderAddOnsService } from './order-add-ons.service.js';

// Patient side: see and answer the "please confirm these extra tests" requests on their own order.
@Controller('orders/:orderId/add-ons')
@UseGuards(JwtAuthGuard)
export class PatientOrderAddOnsController {
  constructor(private readonly addOns: OrderAddOnsService) {}

  @Get()
  list(@Req() req: any, @Param('orderId') orderId: string) {
    return this.addOns.listForPatient(req.user.sub, orderId);
  }

  @Post(':addOnId/confirm')
  confirm(@Req() req: any, @Param('orderId') orderId: string, @Param('addOnId') addOnId: string) {
    return this.addOns.respond(req.user.sub, orderId, addOnId, 'CONFIRM');
  }

  @Post(':addOnId/reject')
  reject(@Req() req: any, @Param('orderId') orderId: string, @Param('addOnId') addOnId: string) {
    return this.addOns.respond(req.user.sub, orderId, addOnId, 'REJECT');
  }
}

// Phlebotomist side: ask the patient to add tests at the door, and watch the answer.
@Controller('phlebotomist/orders/:orderId/add-ons')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistOrderAddOnsController {
  constructor(private readonly addOns: OrderAddOnsService) {}

  @Get()
  list(@Req() req: any, @Param('orderId') orderId: string) {
    return this.addOns.listForPhlebotomist(req.phlebotomist.phlebotomistId, orderId);
  }

  @Post()
  request(@Req() req: any, @Param('orderId') orderId: string, @Body() dto: RequestAddOnDto) {
    return this.addOns.request(req.phlebotomist.phlebotomistId, orderId, dto);
  }

  @Post(':addOnId/cancel')
  cancel(@Req() req: any, @Param('orderId') orderId: string, @Param('addOnId') addOnId: string) {
    return this.addOns.cancelByPhlebotomist(req.phlebotomist.phlebotomistId, orderId, addOnId);
  }
}
