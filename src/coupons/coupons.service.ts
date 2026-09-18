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
  async preview(code: string, userId: string, subtotal: number) {
    const coupon = await this.validate(code, userId, subtotal);
    return { discount: this.computeDiscount(coupon, subtotal), coupon };
  }

  /** Active, current, not-yet-exhausted coupons — for the dashboard's "My Coupons" listing. */
  async listActive() {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return coupons.filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit);
  }

  /**
   * `subtotal` is optional so this can validate a code outside of any cart context — e.g. the
   * dashboard's "Activate a coupon" box, which just confirms a code is genuinely usable before
   * the user has picked anything to book. The minimum-order-value check only makes sense once
   * there's a real subtotal to compare against, so it's skipped when one isn't given.
   */
  async validate(code: string, userId: string, subtotal?: number) {
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
    if (coupon.perUserLimit !== null) {
      // Derived from real order history, not a stored counter — cancelled orders never actually
      // consumed the coupon, so they don't count against the user's limit.
      const usedByUser = await this.prisma.order.count({
        where: { couponId: coupon.id, userId, status: { not: 'CANCELLED' } },
      });
      if (usedByUser >= coupon.perUserLimit) {
        throw new BadRequestException(
          coupon.perUserLimit === 1
            ? 'You have already used this coupon'
            : `You've already used this coupon the maximum ${coupon.perUserLimit} times`,
        );
      }
    }
    if (subtotal !== undefined && coupon.minOrderValue !== null && subtotal < coupon.minOrderValue) {
      throw new BadRequestException(`Minimum order value for this coupon is ₹${coupon.minOrderValue}`);
    }

    return coupon;
  }

  /** Confirms a code is genuinely valid right now, without needing a cart — see `validate`. */
  activate(code: string, userId: string) {
    return this.validate(code, userId);
  }

  computeDiscount(coupon: { type: 'PERCENT' | 'FLAT'; value: number; maxDiscount: number | null }, subtotal: number) {
    const raw = coupon.type === 'PERCENT' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    const capped = coupon.maxDiscount !== null ? Math.min(raw, coupon.maxDiscount) : raw;
    return Math.min(capped, subtotal);
  }
}
