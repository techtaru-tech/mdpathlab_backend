import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a coupon against the given subtotal and returns the discount amount, without
   * consuming a usage slot — usedCount is only incremented atomically when an order is actually
   * placed (see OrdersService), so an "apply" preview can't burn through a limited coupon's uses.
   */
  async preview(code: string, subtotal: number) {
    const coupon = await this.validate(code, subtotal);
    return { discount: this.computeDiscount(coupon, subtotal), coupon };
  }

  async validate(code: string, subtotal: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    const now = new Date();

    if (!coupon || coupon.status !== 'ACTIVE') {
      throw new BadRequestException('Invalid coupon code');
    }
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('This coupon is not active yet');
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      throw new BadRequestException('This coupon has expired');
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('This coupon has reached its usage limit');
    }
    if (coupon.minOrderValue !== null && subtotal < coupon.minOrderValue) {
      throw new BadRequestException(`Minimum order value for this coupon is ₹${coupon.minOrderValue}`);
    }

    return coupon;
  }

  computeDiscount(coupon: { type: 'PERCENT' | 'FLAT'; value: number; maxDiscount: number | null }, subtotal: number) {
    const raw = coupon.type === 'PERCENT' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    const capped = coupon.maxDiscount !== null ? Math.min(raw, coupon.maxDiscount) : raw;
    return Math.min(capped, subtotal);
  }
}
