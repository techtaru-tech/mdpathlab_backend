import { createHmac } from 'crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Same "admin-configurable, DB first" pattern as PaymentsService — never a client cached at boot. */
  private async getRazorpayKeys() {
    const settings = await this.settingsService.getOrCreate();
    return {
      keyId: settings.razorpayKeyId || this.config.get<string>('RAZORPAY_KEY_ID'),
      keySecret: settings.razorpayKeySecret || this.config.get<string>('RAZORPAY_KEY_SECRET'),
    };
  }

  async getWallet(userId: string) {
    const [user, transactions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true } }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { orderNumber: true } } },
      }),
    ]);
    return { balance: user?.walletBalance ?? 0, transactions };
  }

  /** Standalone credit (not part of an existing transaction) — used by the admin "credit wallet" action. */
  creditStandalone(userId: string, amount: number, reason: string) {
    if (amount <= 0) throw new BadRequestException('Credit amount must be positive');
    return this.prisma.$transaction((tx) => this.credit(tx, userId, amount, reason));
  }

  async credit(tx: Tx, userId: string, amount: number, reason: string, orderId?: string) {
    await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: amount } } });
    await tx.walletTransaction.create({ data: { userId, type: 'CREDIT', amount, reason, orderId } });
  }

  /**
   * Debits inside an existing transaction (checkout) — the balance check and decrement happen in
   * one conditional update (`updateMany` with a `gte` guard), the same race-safe pattern used for
   * coupon usage limits in OrdersService, so two concurrent checkouts can never both succeed off
   * a balance that only covers one of them.
   */
  async debit(tx: Tx, userId: string, amount: number, reason: string, orderId?: string) {
    const updated = await tx.user.updateMany({
      where: { id: userId, walletBalance: { gte: amount } },
      data: { walletBalance: { decrement: amount } },
    });
    if (updated.count === 0) throw new BadRequestException('Insufficient wallet balance');
    await tx.walletTransaction.create({ data: { userId, type: 'DEBIT', amount, reason, orderId } });
  }

  /** "Add Money to Wallet" — step 1: open a real Razorpay order for the amount the user chose. */
  async createTopupOrder(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount < 10) throw new BadRequestException('Enter an amount of at least ₹10');
    if (amount > 100000) throw new BadRequestException('For amounts over ₹1,00,000, please contact support');

    const settings = await this.settingsService.getOrCreate();
    if (!settings.onlinePaymentEnabled) throw new BadRequestException('Online payment is currently unavailable');

    const { keyId, keySecret } = await this.getRazorpayKeys();
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rpOrder = await client.orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: `wallet-topup-${userId}-${Date.now()}`,
    });

    return { razorpayOrderId: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency, keyId, userId };
  }

  /**
   * Step 2: verify the signature, then credit — reading the actually-paid amount back from
   * Razorpay rather than trusting whatever the browser sends, so a tampered client request can
   * never credit more than was really paid. Idempotent via the unique `razorpayOrderId` column:
   * if the browser's own call and a later webhook both race to credit the same payment, only the
   * first insert succeeds and the second is treated as "already processed", not an error.
   */
  async verifyTopup(userId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    const { keyId, keySecret } = await this.getRazorpayKeys();
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Payment gateway is not configured yet');

    const expected = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expected !== razorpaySignature) throw new BadRequestException('Payment signature verification failed');

    const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rpOrder = await client.orders.fetch(razorpayOrderId);
    const amount = Math.round(Number(rpOrder.amount) / 100);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.walletTransaction.create({
          data: { userId, type: 'CREDIT', amount, reason: 'Added to wallet', razorpayOrderId, razorpayPaymentId },
        });
        await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: amount } } });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }

    return this.getWallet(userId);
  }
}
