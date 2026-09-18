import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CouponsService } from './coupons.service.js';
import { ApplyCouponDto } from './dto/apply-coupon.dto.js';
import { ActivateCouponDto } from './dto/activate-coupon.dto.js';

@Controller('coupons')
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list() {
    return this.coupons.listActive();
  }

  @Post('apply')
  apply(@Req() req: any, @Body() dto: ApplyCouponDto) {
    return this.coupons.preview(dto.code, req.user.sub, dto.subtotal);
  }

  /** Dashboard's "Activate a coupon" box — confirms a code is genuinely valid, no cart needed. */
  @Post('activate')
  activate(@Req() req: any, @Body() dto: ActivateCouponDto) {
    return this.coupons.activate(dto.code, req.user.sub);
  }
}
