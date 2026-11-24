import type { PrismaService } from '../prisma/prisma.service.js';
import { ratingStats } from './phlebotomist-ratings.js';

// A "completed collection" is the same definition the admin phlebotomist list and the phlebotomist's own
// Collection History use: a HOME order, not cancelled, handed over to the lab. The stored
// Phlebotomist.totalCollections / rating columns are never written to, so both numbers are computed here.
const COMPLETED = { collectionType: 'HOME', status: { not: 'CANCELLED' }, handedOverAt: { not: null } } as const;

/**
 * Rating = average of the patients' ratings of this phlebotomist (POST /orders/:id/phlebotomist-rating, given once
 * the sample is collected). Null until the first rating.
 */
export async function phlebotomistStats(prisma: PrismaService, phlebotomistId: string) {
  const [totalCollections, stats] = await Promise.all([prisma.order.count({ where: { phlebotomistId, ...COMPLETED } }), ratingStats(prisma, phlebotomistId)]);
  return { totalCollections, ...stats };
}
