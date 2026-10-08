import type { PrismaService } from '../prisma/prisma.service.js';

// A "completed collection" is the same definition the admin phlebotomist list and the phlebotomist's own
// Collection History use: a HOME order, not cancelled, handed over to the lab. The stored
// Phlebotomist.totalCollections / rating columns are never written to, so both numbers are computed here.
const COMPLETED = { collectionType: 'HOME', status: { not: 'CANCELLED' }, handedOverAt: { not: null } } as const;

/**
 * Rating = average of the customers' APPROVED reviews on bookings this phlebotomist handled. A customer
 * rates a booking once its report is ready (POST /reviews); the review counts for whoever collected the
 * sample on that order. Null until at least one approved review exists.
 */
export async function phlebotomistStats(prisma: PrismaService, phlebotomistId: string) {
  const [totalCollections, agg] = await Promise.all([
    prisma.order.count({ where: { phlebotomistId, ...COMPLETED } }),
    prisma.review.aggregate({
      where: { status: 'APPROVED', order: { phlebotomistId } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  return {
    totalCollections,
    rating: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 10) / 10,
    ratingCount: agg._count._all,
  };
}
