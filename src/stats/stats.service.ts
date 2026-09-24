import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  // Real, live counts for homepage marketing stats — deliberately not padded/rounded, so the
  // number only ever grows as real patients/orders/reviews are created.
  async getPublicStats() {
    const [customersServed, testsProcessed, ratingAgg, reviewCount] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PATIENT' } }),
      this.prisma.orderItem.count({ where: { order: { status: 'REPORT_READY' } } }),
      this.prisma.review.aggregate({ where: { status: 'APPROVED' }, _avg: { rating: true } }),
      this.prisma.review.count({ where: { status: 'APPROVED' } }),
    ]);

    return {
      customersServed,
      testsProcessed,
      averageRating: ratingAgg._avg.rating,
      reviewCount,
    };
  }
}
