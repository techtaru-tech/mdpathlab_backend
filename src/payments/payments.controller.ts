import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PaymentsService } from './payments.service.js';
import { VerifyPaymentDto } from './dto/verify-payment.dto.js';

@Controller('orders/:id/razorpay')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('create-order')
  createOrder(@Req() req: any, @Param('id') orderId: string) {
    return this.payments.createRazorpayOrder(req.user.sub, orderId);
  }

  @Post('verify')
  verify(@Req() req: any, @Param('id') orderId: string, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyPayment(
      req.user.sub,
      orderId,
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
  }
}

// Razorpay calls POST /payments/razorpay/webhook; /webhooks/razorpay is the older URL, kept until the dashboard is switched.
@Controller(['payments/razorpay/webhook', 'webhooks/razorpay'])
export class RazorpayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  handle(@Req() req: RawBodyRequest<Request>) {
    return this.payments.handleWebhook(
      req.rawBody!,
      req.headers['x-razorpay-signature'] as string | undefined,
      req.headers['x-razorpay-event-id'] as string | undefined,
    );
  }
}
