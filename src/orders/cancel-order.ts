import type { PrismaService } from '../prisma/prisma.service.js';
import type { WalletService } from '../wallet/wallet.service.js';

/**
 * The one way an order is cancelled — used by the patient, admin and lab paths so every one of them refunds the
 * wallet the same way. The CANCELLED flip is a conditional update inside the transaction, so when several cancel
 * requests arrive at once exactly one of them wins and only that one credits the wallet.
 *
 * Returns changed:false when the order was already cancelled (or does not exist); the caller decides the error.
 * Money paid online is not refunded here — that is a manual refund from the Razorpay dashboard.
 */
export async function cancelOrderOnce(
  prisma: PrismaService,
  wallet: WalletService,
  opts: { orderId: string; note: string; changedBy: string },
): Promise<{ changed: boolean; walletRefunded: number }> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: opts.orderId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    });
    if (claimed.count !== 1) return { changed: false, walletRefunded: 0 };

    const order = await tx.order.findUniqueOrThrow({
      where: { id: opts.orderId },
      select: { userId: true, orderNumber: true, walletAmountUsed: true },
    });
    await tx.orderStatusLog.create({
      data: { orderId: opts.orderId, status: 'CANCELLED', note: opts.note, changedBy: opts.changedBy },
    });
    if (order.walletAmountUsed > 0) {
      await wallet.credit(tx, order.userId, order.walletAmountUsed, 'Refund for cancelled order ' + order.orderNumber, opts.orderId);
    }
    return { changed: true, walletRefunded: order.walletAmountUsed };
  });
}
