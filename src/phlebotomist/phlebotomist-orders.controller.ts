import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PhlebotomistOrdersService } from './phlebotomist-orders.service.js';
import { CollectPaymentDto } from './dto/collect-payment.dto.js';
import { HandoverDto } from './dto/handover.dto.js';

// PROPOSED ENDPOINTS — NOT DEFINED BY FSD (the FSD describes screens/behavior, not URLs).
// Named to mirror the existing /auth/phlebotomist/* convention from Phase 1 and the
// /admin/orders, /orders naming style already used elsewhere in this API.
@Controller('phlebotomist')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistOrdersController {
  constructor(private readonly orders: PhlebotomistOrdersService) {}

  @Get('assignments/today')
  listTodaysAssignments(@Req() req: any) {
    return this.orders.listTodaysAssignments(req.phlebotomist.phlebotomistId);
  }

  @Get('orders/:id')
  getBooking(@Req() req: any, @Param('id') id: string) {
    return this.orders.getAssignedBooking(req.phlebotomist.phlebotomistId, id);
  }

  @Post('orders/:id/reached')
  markReached(@Req() req: any, @Param('id') id: string) {
    return this.orders.markReached(req.phlebotomist.phlebotomistId, id);
  }

  @Post('orders/:id/sample-collected')
  markSampleCollected(@Req() req: any, @Param('id') id: string) {
    return this.orders.markSampleCollected(req.phlebotomist.phlebotomistId, id, req.phlebotomist.phone);
  }

  @Post('orders/:id/payment')
  collectPayment(@Req() req: any, @Param('id') id: string, @Body() dto: CollectPaymentDto) {
    return this.orders.markPaymentCollected(req.phlebotomist.phlebotomistId, id, dto.amount, dto.paymentMode);
  }

  @Post('orders/:id/handover')
  handover(@Req() req: any, @Param('id') id: string, @Body() dto: HandoverDto) {
    return this.orders.markHandedOver(req.phlebotomist.phlebotomistId, id, dto.sampleBarcode, req.phlebotomist.phone);
  }

  @Get('collections/history')
  getCollectionHistory(@Req() req: any) {
    return this.orders.getCollectionHistory(req.phlebotomist.phlebotomistId);
  }
}
