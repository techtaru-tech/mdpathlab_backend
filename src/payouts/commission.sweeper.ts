import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type CartItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PayoutsService } from './payouts.service.js';
import { orderCommission, rateToBasisPoints } from './commission-policy.js';

export const COMMISSION_SWEEPER_ID = 'commission-sweeper';
const RUN_EVERY_MS = 60_000;
const BATCH = 200;

/**
 * Writes commission to the ledger AFTER the fact, like the referral snapshot job — nothing in booking, payment,
 * report or cancellation code knows about commission, so it can never fail or slow any of them. Every minute:
 *
 * 1. Rates (only while commission is on): each line of a referred booking gets the rate its test had at booking
 *    time — the test's own rate (Admin → Payouts → Test-wise rates) or the default — so changing a rate later never
 *    changes an existing booking. Lines added at the door get the rate in force when they appear.
 * 2. Earnings (only while on): a booking earns once its report is ready and it is paid, if it was placed after
 *    commission was switched on, the referral was active and the partner approved when it was booked, and both
 *    still are. Each test earns its own rate on its price after its share of the discount.
 * 3. Reversals (always, even while off): an earned booking that is later cancelled or refunded gets a matching
 *    negative row.
 * All three are idempotent — one rate per line, one earning and one reversal per order, enforced by the database.
 */
@Injectable()
export class CommissionSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Commission');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
  ) {}

  onModuleInit() {
    const tick = () => void this.runOnce().catch((err) => this.logger.error(`Commission run failed: ${(err as Error).message}`));
    setTimeout(tick, 30_000).unref();
    this.timer = setInterval(tick, RUN_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<{ ratesRecorded: number; earned: number; reversed: number; skipped?: boolean }> {
    if (this.running) return { ratesRecorded: 0, earned: 0, reversed: 0, skipped: true };
    this.running = true;
    const startedAt = new Date();
    try {
      const reversed = await this.reverseCancelled();
      const settings = await this.payouts.settings();
      const on = settings.enabled && settings.activeSince ? settings : null;
      const ratesRecorded = on ? await this.recordRates(on.activeSince!, on.ratePercent) : 0;
      const earned = on ? await this.recordEarnings(on.activeSince!, on.holdDays) : 0;
      await this.heartbeat({ lastRunAt: startedAt, lastSuccessAt: startedAt, lastProcessed: earned + reversed, lastError: null });
      if (earned || reversed) this.logger.log(`Commission: ${earned} earning(s), ${reversed} reversal(s)`);
      return { ratesRecorded, earned, reversed };
    } catch (err) {
      await this.heartbeat({ lastRunAt: startedAt, lastError: (err as Error).message.slice(0, 500) }).catch(() => undefined);
      throw err;
    } finally {
      this.running = false;
    }
  }

  private heartbeat(data: { lastRunAt: Date; lastSuccessAt?: Date; lastProcessed?: number; lastError: string | null }) {
    return this.prisma.referralJobHeartbeat.upsert({ where: { id: COMMISSION_SWEEPER_ID }, create: { id: COMMISSION_SWEEPER_ID, ...data }, update: data });
  }

  private async recordRates(activeSince: Date, defaultRate: Prisma.Decimal): Promise<number> {
    const lines = await this.prisma.orderItem.findMany({
      where: {
        commissionRate: null,
        order: { createdAt: { gte: activeSince }, referralAttribution: { isNot: null }, commissionEntries: { none: { type: 'EARNING' } } },
      },
      take: BATCH * 5,
      select: { id: true, orderId: true, itemType: true, itemId: true },
    });
    if (lines.length === 0) return 0;
    const own = await this.prisma.commissionRate.findMany({
      where: { OR: lines.map((l) => ({ itemType: l.itemType, itemId: l.itemId })) },
      select: { itemType: true, itemId: true, ratePercent: true },
    });
    const rateOf = new Map(own.map((r) => [`${r.itemType}:${r.itemId}`, r.ratePercent]));
    const data = lines.map((l) => {
      const rate = rateOf.get(`${l.itemType}:${l.itemId}`);
      return { orderItemId: l.id, orderId: l.orderId, ratePercent: rate ?? defaultRate, source: rate ? 'ITEM' : 'DEFAULT' };
    });
    return (await this.prisma.orderItemCommissionRate.createMany({ data, skipDuplicates: true })).count;
  }

  private async recordEarnings(activeSince: Date, holdDays: number): Promise<number> {
    const rows = await this.prisma.orderReferralAttribution.findMany({
      where: {
        referralStatusAtBooking: 'ACTIVE',
        partnerStatusAtBooking: 'APPROVED',
        patientReferral: { status: 'ACTIVE' },
        partner: { status: 'APPROVED' },
        order: {
          status: 'REPORT_READY',
          paymentStatus: 'PAID',
          createdAt: { gte: activeSince },
          commissionEntries: { none: { type: 'EARNING' } },
        },
      },
      take: BATCH,
      select: {
        orderId: true,
        partnerId: true,
        order: { select: { discount: true, items: { select: { itemName: true, itemType: true, price: true, commissionRate: { select: { ratePercent: true } } } } } },
      },
    });
    const availableAt = new Date(Date.now() + holdDays * 24 * 3600_000);
    const data: Prisma.CommissionEntryCreateManyInput[] = [];
    for (const r of rows) {
      // Every line needs its booking-time rate first; a line without one gets it on this or the next run.
      if (r.order.items.length === 0 || r.order.items.some((i) => !i.commissionRate)) continue;
      const result = orderCommission(
        r.order.items.map((i) => ({ name: i.itemName, itemType: i.itemType as CartItemType, priceRupees: i.price, ratePercent: i.commissionRate!.ratePercent })),
        r.order.discount,
      );
      if (result.amountPaise <= 0) continue;
      const rates = new Set(result.lines.map((l) => rateToBasisPoints(l.ratePercent)));
      data.push({
        partnerId: r.partnerId,
        type: 'EARNING',
        orderId: r.orderId,
        amountPaise: result.amountPaise,
        baseRupees: result.baseRupees,
        ratePercent: rates.size === 1 ? new Prisma.Decimal(result.lines[0]!.ratePercent) : null,
        breakdown: result.lines as unknown as Prisma.InputJsonValue,
        availableAt,
      });
    }
    if (data.length === 0) return 0;
    return (await this.prisma.commissionEntry.createMany({ data, skipDuplicates: true })).count;
  }

  private async reverseCancelled(): Promise<number> {
    const earned = await this.prisma.commissionEntry.findMany({
      where: {
        type: 'EARNING',
        order: {
          OR: [{ status: 'CANCELLED' }, { paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } }],
          commissionEntries: { none: { type: 'REVERSAL' } },
        },
      },
      take: BATCH,
      select: { partnerId: true, orderId: true, amountPaise: true },
    });
    if (earned.length === 0) return 0;
    const data = earned.map((e) => ({ partnerId: e.partnerId, type: 'REVERSAL' as const, orderId: e.orderId, amountPaise: -e.amountPaise, note: 'Booking cancelled or refunded' }));
    return (await this.prisma.commissionEntry.createMany({ data, skipDuplicates: true })).count;
  }

  async health() {
    const beat = await this.prisma.referralJobHeartbeat.findUnique({ where: { id: COMMISSION_SWEEPER_ID } });
    return { heartbeat: beat, stale: !beat?.lastSuccessAt || Date.now() - beat.lastSuccessAt.getTime() > 10 * 60_000 };
  }
}
