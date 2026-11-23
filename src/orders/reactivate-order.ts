import { BadRequestException } from '@nestjs/common';
import { isPastIstSlot } from '../common/ist-time.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SlotsService } from '../slots/slots.service.js';
import type { WalletService } from '../wallet/wallet.service.js';

/**
 * Brings a cancelled booking back after the team has spoken to the patient — the reverse of cancelOrderOnce().
 * The booking gets a new visit (date + slot, checked for capacity like any checkout) and goes back to CONFIRMED
 * with no phlebotomist, so it is assigned again for the new visit.
 *
 * Money:
 * - Wallet money that the cancel refunded is taken from the wallet again. If the patient has spent it since,
 *   a pay-on-collection booking simply collects that much more at the door; an already-paid booking is refused
 *   (there is no way to collect it), and the team makes a new booking instead.
 * - An online booking that was never paid becomes pay on collection.
 * - An online payment that was refunded (paymentStatus REFUNDED / PARTIALLY_REFUNDED) is refused.
 *
 * A booking whose sample was already collected or handed over is refused — that is not a visit to bring back.
 * The CANCELLED → CONFIRMED flip is conditional, so two reactivations at once cannot both go through.
 */
export async function reactivateOrderOnce(
  prisma: PrismaService,
  wallet: WalletService,
  slots: SlotsService,
  opts: { orderId: string; scheduledDate: string; slotId: string; note: string; changedBy: string },
): Promise<{ walletDebited: number; movedToCollection: number; switchedToCod: boolean; slotLabel: string }> {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { homeCollectionRequest: { select: { status: true } } },
  });
  if (!order) throw new BadRequestException('Order not found');
  if (order.status !== 'CANCELLED') throw new BadRequestException('Only a cancelled booking can be reactivated');
  if (order.handedOverAt || order.sampleReceivedAt || order.collectionOtpVerifiedAt) {
    throw new BadRequestException('The sample for this booking was already collected — create a new booking instead');
  }
  if (order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
    throw new BadRequestException('The online payment for this booking was refunded — create a new booking instead');
  }
  if (order.homeCollectionRequest && ['CANCELLED', 'NO_SHOW'].includes(order.homeCollectionRequest.status)) {
    throw new BadRequestException('This booking came from a home visit request that was closed — create a new booking instead');
  }

  const slot = await prisma.slot.findUnique({ where: { id: opts.slotId } });
  if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
  if (isPastIstSlot(opts.scheduledDate, slot.startTime)) {
    throw new BadRequestException('This slot has already passed — choose an upcoming date or time');
  }

  const unpaidOnline = order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID';
  const prepaid = order.paymentStatus === 'PAID';

  return prisma.$transaction(async (tx) => {
    await slots.reserveCapacityOrThrow(tx, opts.slotId, opts.scheduledDate, order.collectionType, order.collectionCenterId ?? undefined);

    // Take back the wallet money the cancel refunded; if it is no longer there, collect it at the door instead.
    let walletDebited = 0;
    let movedToCollection = 0;
    if (order.walletAmountUsed > 0) {
      const balance = await tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { walletBalance: true } });
      if (balance.walletBalance >= order.walletAmountUsed) {
        await wallet.debit(tx, order.userId, order.walletAmountUsed, 'Booking ' + order.orderNumber + ' reactivated', order.id);
        walletDebited = order.walletAmountUsed;
      } else if (prepaid) {
        throw new BadRequestException(
          `The patient has already spent the ₹${order.walletAmountUsed} wallet refund from this booking, and it is paid online — create a new booking instead`,
        );
      } else {
        movedToCollection = order.walletAmountUsed;
      }
    }

    const notes = [`Booking reactivated — visit on ${opts.scheduledDate} ${slot.label}`];
    if (walletDebited) notes.push(`₹${walletDebited} taken from wallet again`);
    if (movedToCollection) notes.push(`wallet refund already spent — ₹${movedToCollection} more to collect`);
    if (unpaidOnline) notes.push('online payment not made — pay on collection');
    if (opts.note) notes.push(opts.note);

    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: 'CANCELLED' },
      data: {
        status: 'CONFIRMED',
        scheduledDate: SlotsService.dateKey(opts.scheduledDate),
        slotId: opts.slotId,
        ...(unpaidOnline ? { paymentMethod: 'COD', paymentStatus: 'PENDING' } : {}),
        ...(movedToCollection ? { walletAmountUsed: 0, total: { increment: movedToCollection } } : {}),
        // A new visit — none of the old visit's workflow carries over.
        phlebotomistId: null,
        assignmentStatus: null,
        assignmentRejectedReason: null,
        onTheWayAt: null,
        reachedAt: null,
        collectionOtp: null,
        collectionOtpVerifiedAt: null,
        collectionOtpAttempts: 0,
        collectionOtpLockedUntil: null,
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('This booking was already reactivated');
    await tx.orderStatusLog.create({
      data: { orderId: order.id, status: 'CONFIRMED', note: notes.join(' — '), changedBy: opts.changedBy },
    });
    return { walletDebited, movedToCollection, switchedToCod: unpaidOnline, slotLabel: slot.label };
  });
}
