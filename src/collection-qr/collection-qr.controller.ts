import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { CollectionQrService } from './collection-qr.service.js';

// UPI at the door (phlebotomist app / web): show the QR, then poll its status until it is paid.
@Controller('phlebotomist/orders/:id/upi-qr')
@UseGuards(PhlebotomistAuthGuard)
export class CollectionQrController {
  constructor(private readonly qr: CollectionQrService) {}

  // { id, status, amount, imageUrl, expiresAt } — reuses the still-valid QR for the same amount.
  @Post()
  create(@Req() req: any, @Param('id') orderId: string) {
    return this.qr.create(req.phlebotomist.phlebotomistId, orderId);
  }

  // status: ACTIVE (waiting) | PAID (booking is now paid) | PAID_LATE | CLOSED; expired: true when it timed out.
  @Get(':qrId')
  status(@Req() req: any, @Param('id') orderId: string, @Param('qrId') qrId: string) {
    return this.qr.status(req.phlebotomist.phlebotomistId, orderId, qrId);
  }
}
