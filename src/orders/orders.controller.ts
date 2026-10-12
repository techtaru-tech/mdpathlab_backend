import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PerUserRateLimit, UserThrottlerGuard } from '../common/user-throttler.guard.js';
import { OrdersService } from './orders.service.js';
import { CheckoutSessionsService } from './checkout-sessions.service.js';
import { CheckoutDto, RazorpayCheckoutOrderDto } from './dto/checkout.dto.js';
import { QuoteDto } from './dto/quote.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly sessions: CheckoutSessionsService,
  ) {}

  // Prices a prospective booking (subtotal/discount/collection fee/total) without creating an
  // order — the checkout summary screen calls this so the number shown is guaranteed to be the
  // same one checkout() would charge, rather than a second, independently-maintained calculation.
  @Post('quote')
  quote(@Req() req: any, @Body() dto: QuoteDto) {
    return this.orders.quote(req.user.sub, dto);
  }

  // Pay first, then book — step 1: price what is being booked, hold the slot and wallet amount for 15 minutes and
  // open a Razorpay order for it. No booking is created. Returns { orderId, amount (paise), currency, keyId }.
  @Post('checkout/razorpay-order')
  @UseGuards(UserThrottlerGuard)
  @PerUserRateLimit(10, 60_000)
  razorpayOrder(@Req() req: any, @Body() dto: RazorpayCheckoutOrderDto) {
    return this.sessions.createRazorpayOrder(req.user.sub, dto);
  }

  // Creates the booking. Pay at collection (CASH/COD) and nothing-to-pay ONLINE are booked at once; ONLINE with
  // something to pay needs the Razorpay proof from step 1's payment (201 when booked now, 200 for a retry).
  @Post('checkout')
  @UseGuards(UserThrottlerGuard)
  @PerUserRateLimit(10, 60_000)
  async checkout(@Req() req: any, @Body() dto: CheckoutDto, @Res({ passthrough: true }) res: Response) {
    if (dto.paymentMethod === 'ONLINE' && dto.razorpay_order_id) {
      const { order, created } = await this.sessions.checkoutWithProof(req.user.sub, dto);
      res.status(created ? 201 : 200);
      return order;
    }
    return this.orders.checkout(req.user.sub, dto);
  }

  @Get()
  list(@Req() req: any) {
    return this.orders.list(req.user.sub);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.orders.getOne(req.user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(req.user.sub, id, dto?.reason);
  }

  @Get(':id/results')
  getResults(@Req() req: any, @Param('id') id: string) {
    return this.orders.getResults(req.user.sub, id);
  }

  @Get(':id/track')
  getTracking(@Req() req: any, @Param('id') id: string) {
    return this.orders.getTracking(req.user.sub, id);
  }
}
