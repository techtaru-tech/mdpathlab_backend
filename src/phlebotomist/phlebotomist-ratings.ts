import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Phlebotomist ratings — the patient's 1–5 star rating (and optional comment) of the phlebotomist who collected
 * their sample, one per booking (PhlebotomistRating). Every screen that shows a phlebotomist's rating — their own
 * app, the lab's and admin's phlebotomist lists, the Excel exports — reads it from here so they always agree.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Average rating (one decimal, null until the first rating) and count, for each of the given phlebotomists. */
export async function ratingStatsFor(prisma: PrismaService, phlebotomistIds: string[]) {
  const byId = new Map<string, { rating: number | null; ratingCount: number }>();
  if (phlebotomistIds.length === 0) return byId;
  const groups = await prisma.phlebotomistRating.groupBy({
    by: ['phlebotomistId'],
    where: { phlebotomistId: { in: phlebotomistIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  for (const g of groups) {
    byId.set(g.phlebotomistId, { rating: g._avg.rating === null ? null : round1(g._avg.rating), ratingCount: g._count._all });
  }
  return byId;
}

export async function ratingStats(prisma: PrismaService, phlebotomistId: string) {
  return (await ratingStatsFor(prisma, [phlebotomistId])).get(phlebotomistId) ?? { rating: null, ratingCount: 0 };
}

/**
 * The ratings a phlebotomist received, newest first, with how many of each star. Only the patient's first name is
 * shown — never their phone number.
 */
export async function listRatings(prisma: PrismaService, phlebotomistId: string, take = 100) {
  const [stats, rows, breakdown] = await Promise.all([
    ratingStats(prisma, phlebotomistId),
    prisma.phlebotomistRating.findMany({
      where: { phlebotomistId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        order: { select: { id: true, orderNumber: true, scheduledDate: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.phlebotomistRating.groupBy({ by: ['rating'], where: { phlebotomistId }, _count: { _all: true } }),
  ]);
  const stars: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
  for (const b of breakdown) stars[String(b.rating)] = b._count._all;
  return {
    rating: stats.rating,
    ratingCount: stats.ratingCount,
    stars,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      visitDate: r.order.scheduledDate,
      customerName: r.user.name?.trim().split(' ')[0] || 'Customer',
    })),
  };
}

/** The sample has been taken: the doorstep code was verified, it was handed over, or the booking moved past collection. */
export function sampleCollected(order: { status: string; collectionOtpVerifiedAt: Date | null; handedOverAt: Date | null }) {
  return (
    Boolean(order.collectionOtpVerifiedAt || order.handedOverAt) ||
    order.status === 'SAMPLE_COLLECTED' ||
    order.status === 'IN_LAB' ||
    order.status === 'REPORT_READY'
  );
}
