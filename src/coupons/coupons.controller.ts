import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CouponsService } from './coupons.service.js';
import { ApplyCouponDto } from './dto/apply-coupon.dto.js';

@Controller('coupons')
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post('apply')
  apply(@Body() dto: ApplyCouponDto) {
    return this.coupons.preview(dto.code, dto.subtotal);
  }
}
