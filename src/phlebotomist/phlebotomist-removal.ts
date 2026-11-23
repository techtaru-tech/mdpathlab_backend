import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';

// Work a phlebotomist still has in hand: a booking assigned and not yet handed over to the lab, or an open
// home visit. These must be reassigned (or finished) before the phlebotomist can be deleted.
const OPEN_ORDER_STATUSES = ['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED'] as const;
const OPEN_HOME_VISIT_STATUSES = ['ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'TESTS_ADDED', 'COLLECTED'] as const;

/**
 * Deletes a phlebotomist from admin or a lab. It is a soft delete: their past bookings and home visits keep
 * showing who collected them, so the profile row stays, marked deleted and INACTIVE. From that moment the
 * phlebotomist app logs out (every request checks the status), they disappear from lists, assignment and
 * exports, and their phlebotomist pushes stop. The person's customer account, if the number is also a
 * customer, is not touched. Adding the same number as a phlebotomist again brings the profile back.
 */
export async function deletePhlebotomist(prisma: PrismaService, id: string) {
  const phlebotomist = await prisma.phlebotomist.findUnique({ where: { id }, select: { id: true, userId: true, deletedAt: true } });
  if (!phlebotomist || phlebotomist.deletedAt) throw new BadRequestException('Phlebotomist not found');

  const [orders, homeVisits] = await Promise.all([
    prisma.order.findMany({
      where: { phlebotomistId: id, status: { in: [...OPEN_ORDER_STATUSES] }, handedOverAt: null },
      select: { orderNumber: true },
      take: 5,
    }),
    prisma.homeCollectionRequest.count({ where: { phlebotomistId: id, status: { in: [...OPEN_HOME_VISIT_STATUSES] } } }),
  ]);
  if (orders.length) {
    throw new BadRequestException(
      `This phlebotomist still has bookings in hand (${orders.map((o) => o.orderNumber).join(', ')}). Reassign them or finish them first.`,
    );
  }
  if (homeVisits) throw new BadRequestException('This phlebotomist still has open home visits. Reassign them or finish them first.');

  await prisma.phlebotomist.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  await removeAllDeviceTokens(prisma, phlebotomist.userId, 'PHLEBOTOMIST');
  return { deleted: true };
}
