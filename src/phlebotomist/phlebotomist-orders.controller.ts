import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PhlebotomistOrdersService } from './phlebotomist-orders.service.js';
import { CollectPaymentDto } from './dto/collect-payment.dto.js';
import { HandoverDto } from './dto/handover.dto.js';
import { RejectAssignmentDto } from './dto/reject-assignment.dto.js';
import { VerifyCollectionOtpDto } from './dto/verify-collection-otp.dto.js';
import { UpdateSampleDto } from './dto/update-sample.dto.js';

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

  @Post('orders/:id/accept')
  accept(@Req() req: any, @Param('id') id: string) {
    return this.orders.acceptAssignment(req.phlebotomist.phlebotomistId, id);
  }

  @Post('orders/:id/reject')
  reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectAssignmentDto) {
    return this.orders.rejectAssignment(req.phlebotomist.phlebotomistId, id, dto.reason);
  }

  @Post('orders/:id/on-the-way')
  onTheWay(@Req() req: any, @Param('id') id: string) {
    return this.orders.markOnTheWay(req.phlebotomist.phlebotomistId, id);
  }

  @Post('orders/:id/reached')
  markReached(@Req() req: any, @Param('id') id: string) {
    return this.orders.markReached(req.phlebotomist.phlebotomistId, id);
  }

  @Post('orders/:id/verify-otp')
  verifyOtp(@Req() req: any, @Param('id') id: string, @Body() dto: VerifyCollectionOtpDto) {
    return this.orders.verifyCollectionOtp(req.phlebotomist.phlebotomistId, id, dto.code);
  }

  @Get('orders/:id/samples')
  listSamples(@Req() req: any, @Param('id') id: string) {
    return this.orders.listSamples(req.phlebotomist.phlebotomistId, id);
  }

  @Patch('orders/:id/samples/:orderItemId')
  updateSample(@Req() req: any, @Param('id') id: string, @Param('orderItemId') orderItemId: string, @Body() dto: UpdateSampleDto) {
    return this.orders.updateSample(req.phlebotomist.phlebotomistId, id, orderItemId, dto);
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
