import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WalletService } from './wallet.service.js';
import { CreateTopupOrderDto } from './dto/create-topup-order.dto.js';
import { VerifyTopupDto } from './dto/verify-topup.dto.js';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@Req() req: any) {
    return this.wallet.getWallet(req.user.sub);
  }

  @Post('topup/order')
  createTopupOrder(@Req() req: any, @Body() dto: CreateTopupOrderDto) {
    return this.wallet.createTopupOrder(req.user.sub, dto.amount);
  }

  @Post('topup/verify')
  verifyTopup(@Req() req: any, @Body() dto: VerifyTopupDto) {
    return this.wallet.verifyTopup(req.user.sub, dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
  }
}
