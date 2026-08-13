import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrdersService } from './orders.service.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { QuoteDto } from './dto/quote.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Prices a prospective booking (subtotal/discount/collection fee/total) without creating an
  // order — the checkout summary screen calls this so the number shown is guaranteed to be the
  // same one checkout() would charge, rather than a second, independently-maintained calculation.
  @Post('quote')
  quote(@Req() req: any, @Body() dto: QuoteDto) {
    return this.orders.quote(req.user.sub, dto);
  }

  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
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
}
