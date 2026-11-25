import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { CollectionUpiQr, Order } from '@prisma/client';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { describeGatewayError, RazorpayGateway } from '../payments/razorpay-gateway.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How long one QR stays payable. Razorpay needs close_by at least a few minutes ahead.
const QR_LIFETIME_MS = 15 * 60_000;

/** What a pay-at-collection booking owes at the door right now, or why it can't be collected. */
export function amountDueAtDoor(order: Pick<Order, 'paymentMethod' | 'addOnTotal' | 'total' | 'status' | 'collectedAmount' | 'collectionPaymentMode'>): number {
  // A booking already paid online/by wallet only owes what was added at the door.
  const owesAddOnOnly = order.paymentMethod !== 'COD' && order.addOnTotal > 0;
  if (order.paymentMethod !== 'COD' && !owesAddOnOnly) throw new BadRequestException('This booking is not set up for pay-at-collection');
  if (order.status !== 'SAMPLE_COLLECTED') throw new BadRequestException('The sample must be marked collected before payment can be taken');
  if (order.collectedAmount !== null || order.collectionPaymentMode !== null) throw new BadRequestException('Payment has already been recorded for this booking');
  return owesAddOnOnly ? order.addOnTotal : order.total;
}

type QrView = { id: string; status: CollectionUpiQr['status']; amount: number; imageUrl: string; expiresAt: Date; paidAt: Date | null; razorpayPaymentId: string | null };
const view = (q: CollectionUpiQr): QrView => ({
  id: q.id,
  status: q.status,
  amount: q.amount,
  imageUrl: q.imageUrl,
  expiresAt: q.expiresAt,
  paidAt: q.paidAt,
  razorpayPaymentId: q.razorpayPaymentId,
});

/**
 * UPI payment at the door through the MD Path Labs Razorpay account: the phlebotomist shows a single-use QR for the
 * exact amount due; the booking becomes PAID (mode UPI) only when Razorpay reports the payment — by the
 * qr_code.credited webhook or the phlebotomist's status check, whichever comes first (settle() is idempotent).
 */
@Injectable()
export class CollectionQrService {
  private readonly logger = new Logger('CollectionQr');

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RazorpayGateway,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private async ownBooking(phlebotomistId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.phlebotomistId !== phlebotomistId) throw new NotFoundException('Booking not found');
    if (order.collectionType !== 'HOME') throw new BadRequestException('Only home-collection bookings support this action');
    if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled and can no longer be updated');
    return order;
  }

  /** The QR to show now: the still-valid one for this amount, or a new one. */
  async create(phlebotomistId: string, orderId: string) {
    const order = await this.ownBooking(phlebotomistId, orderId);
    const amount = amountDueAtDoor(order);

    const existing = await this.prisma.collectionUpiQr.findFirst({
      where: { orderId, status: 'ACTIVE', amount, expiresAt: { gt: new Date(Date.now() + 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return view(existing);

    // Older ones (different amount, nearly expired) are closed so only one QR can take money.
    await this.closeActive(orderId);

    const expiresAt = new Date(Date.now() + QR_LIFETIME_MS);
    let qr: { id: string; image_url: string };
    try {
      qr = await this.gateway.createUpiQr({
        amountPaise: amount * 100,
        description: `Booking ${order.orderNumber}`,
        closeBy: Math.floor(expiresAt.getTime() / 1000),
        notes: { purpose: 'home_collection', orderId, orderNumber: order.orderNumber },
      });
    } catch (err) {
      this.logger.error(`UPI QR for ${order.orderNumber} failed: ${describeGatewayError(err)}`);
      await this.gateway.audit({ event: 'collection_qr.create', result: 'failed', orderId, amount, detail: describeGatewayError(err) });
      throw new ServiceUnavailableException('Could not create the UPI QR right now — please try again, or collect cash');
    }
    const row = await this.prisma.collectionUpiQr.create({
      data: { orderId, phlebotomistId, razorpayQrId: qr.id, imageUrl: qr.image_url, amount, expiresAt },
    });
    await this.gateway.audit({ event: 'collection_qr.create', result: 'ok', orderId, amount, detail: qr.id });
    return view(row);
  }

  /** Has the patient paid? Asks Razorpay too, so a missed webhook never leaves the phlebotomist waiting. */
  async status(phlebotomistId: string, orderId: string, qrId: string) {
    await this.ownBooking(phlebotomistId, orderId);
    let q = await this.prisma.collectionUpiQr.findUnique({ where: { id: qrId } });
    if (!q || q.orderId !== orderId) throw new NotFoundException('QR not found');
    if (q.status === 'ACTIVE') {
      try {
        const paid = (await this.gateway.upiQrPayments(q.razorpayQrId)).find((p) => p.status === 'captured');
        if (paid) await this.settle(q.razorpayQrId, paid.id, paid.amount, 'status-check');
      } catch (err) {
        this.logger.warn(`QR status check failed for ${q.razorpayQrId}: ${describeGatewayError(err)}`);
      }
      q = (await this.prisma.collectionUpiQr.findUnique({ where: { id: qrId } }))!;
    }
    const expired = q.status === 'ACTIVE' && q.expiresAt.getTime() < Date.now();
    return { ...view(q), expired };
  }

  /**
   * A payment on one of our QRs (webhook or status check). Marks the booking paid once; a payment that arrives
   * after the booking was settled another way is kept as PAID_LATE and admins are told to refund it.
   * Returns false when the QR is not one of ours.
   */
  async settle(razorpayQrId: string, paymentId: string, amountPaise: number, source: string): Promise<boolean> {
    const q = await this.prisma.collectionUpiQr.findUnique({ where: { razorpayQrId }, include: { order: true } });
    if (!q) return false;
    if (q.razorpayPaymentId) return true; // already handled

    if (amountPaise !== q.amount * 100) {
      this.logger.warn(`Security: QR ${razorpayQrId} paid ${amountPaise} paise, expected ${q.amount * 100}`);
      await this.gateway.audit({ event: 'collection_qr.paid', result: 'amount_mismatch', orderId: q.orderId, razorpayPaymentId: paymentId, amount: Math.round(amountPaise / 100) });
      return true;
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.collectionUpiQr.updateMany({ where: { id: q.id, razorpayPaymentId: null }, data: { razorpayPaymentId: paymentId, paidAt: now } });
      if (claimed.count !== 1) return 'duplicate' as const;
      const booked = await tx.order.updateMany({
        where: { id: q.orderId, collectedAmount: null, collectionPaymentMode: null, status: { not: 'CANCELLED' } },
        data: { collectedAmount: q.amount, collectionPaymentMode: 'UPI', collectedAt: now, paymentStatus: 'PAID' },
      });
      await tx.collectionUpiQr.update({ where: { id: q.id }, data: { status: booked.count === 1 ? 'PAID' : 'PAID_LATE' } });
      if (booked.count === 1) {
        await tx.orderStatusLog.create({
          data: { orderId: q.orderId, status: q.order.status, note: `₹${q.amount} paid by UPI QR at collection (Razorpay ${paymentId})`, changedBy: 'RAZORPAY' },
        });
      }
      return booked.count === 1 ? ('paid' as const) : ('late' as const);
    });
    if (outcome === 'duplicate') return true;

    await this.gateway.audit({ event: 'collection_qr.paid', result: outcome, orderId: q.orderId, razorpayPaymentId: paymentId, amount: q.amount, detail: source });
    if (outcome === 'paid') {
      await this.notifications.notifyUser(q.order.userId, {
        title: 'Payment received',
        body: `Order ${q.order.orderNumber} — ₹${q.amount} received by UPI. Thank you!`,
        data: { type: 'PAYMENT', orderId: q.orderId, status: 'PAID' },
      });
      await this.notifications.notifyPhlebotomist(q.phlebotomistId, {
        title: 'UPI payment received',
        body: `Order ${q.order.orderNumber} — ₹${q.amount} received`,
        data: { type: 'COLLECTION_PAYMENT', orderId: q.orderId, status: 'PAID' },
      });
      void this.mail.paymentReceiptForOrder(q.orderId);
    } else {
      await this.notifications.notifyAdmins({
        title: 'Extra UPI payment — refund needed',
        body: `Order ${q.order.orderNumber}: ₹${q.amount} was paid by UPI QR after the booking was already settled. Refund payment ${paymentId} from Razorpay.`,
        data: { type: 'PAYMENT', orderId: q.orderId, status: 'PAID_LATE' },
      });
    }
    return true;
  }

  /** Closes every still-open QR of a booking (called when payment is recorded another way). Never throws. */
  async closeActive(orderId: string) {
    const open = await this.prisma.collectionUpiQr.findMany({ where: { orderId, status: 'ACTIVE' } });
    for (const q of open) {
      const done = await this.prisma.collectionUpiQr.updateMany({ where: { id: q.id, status: 'ACTIVE', razorpayPaymentId: null }, data: { status: 'CLOSED' } });
      if (done.count === 1) {
        await this.gateway.closeUpiQr(q.razorpayQrId).catch((err: unknown) => this.logger.warn(`Closing QR ${q.razorpayQrId} failed: ${describeGatewayError(err)}`));
      }
    }
  }
}
