import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type CartItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PayoutsService } from './payouts.service.js';
import { lineCategory, mouInForce, orderCommission, pickRate, rateToBasisPoints, reversalBreakdown, reversalTargetPaise } from './commission-policy.js';

export const COMMISSION_SWEEPER_ID = 'commission-sweeper';
const RUN_EVERY_MS = 60_000;
const BATCH = 200;

/**
 * Writes commission to the ledger AFTER the fact, like the referral snapshot job — nothing in booking, payment,
 * report or cancellation code knows about commission, so it can never fail or slow any of them. Every minute:
 *
 * 1. Rates (only while commission is on): each line of a referred booking gets the rate in force at booking time —
 *    the referring partner's MOU rate for the line's category (Routine / Special / Package), or, for a partner with
 *    no MOU, the test's own rate (Admin → Payouts → Test-wise rates) or the default — so changing an MOU or a rate
 *    later never changes an existing booking. Lines added at the door get the rate when they appear.
 * 2. Earnings (only while on): a booking earns once its report is ready (any payment method), if it was placed after
 *    commission was switched on, the referral was active and the partner approved when it was booked, and both
 *    still are. Each test earns its own rate on its price after its share of the discount.
 * 3. Reversals (always, even while off): an earned booking that is later cancelled or fully refunded is reversed
 *    in full; a partial refund reverses the commission on the refunded part (one negative row per step).
 * All three are idempotent — one rate per line, one earning per order and each reversal step once, enforced by the database.
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
      const ratesRecorded = on ? await this.recordRates(on.activeSince!) : 0;
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

  private async recordRates(activeSince: Date): Promise<number> {
    const lines = await this.prisma.orderItem.findMany({
      where: {
        commissionRate: null,
        order: { createdAt: { gte: activeSince }, referralAttribution: { isNot: null }, commissionEntries: { none: { type: 'EARNING' } } },
      },
      take: BATCH * 5,
      select: { id: true, orderId: true, itemType: true, itemId: true, order: { select: { createdAt: true, referralAttribution: { select: { partnerId: true } } } } },
    });
    if (lines.length === 0) return 0;
    const keys = lines.map((l) => ({ itemType: l.itemType, itemId: l.itemId }));
    const partnerIds = [...new Set(lines.map((l) => l.order.referralAttribution?.partnerId).filter((id): id is string => Boolean(id)))];
    const [marked, mous] = await Promise.all([
      this.prisma.commissionItemCategory.findMany({ where: { OR: keys }, select: { itemType: true, itemId: true, category: true } }),
      this.prisma.partnerCommissionMou.findMany({
        // Only an MOU the admin verified (signed by the partner) gives MOU rates.
        where: { partnerId: { in: partnerIds }, withdrawnAt: null, signatureStatus: 'VERIFIED' },
        select: {
          id: true,
          partnerId: true,
          routinePercent: true,
          specialPercent: true,
          packagePercent: true,
          effectiveFrom: true,
          withdrawnAt: true,
          signatureStatus: true,
          verifiedAt: true,
        },
      }),
    ]);
    const categoryOf = new Map(marked.map((r) => [`${r.itemType}:${r.itemId}`, r.category]));
    const data = lines.map((l) => {
      const key = `${l.itemType}:${l.itemId}`;
      const category = lineCategory(l.itemType, categoryOf.get(key));
      const partnerId = l.order.referralAttribution?.partnerId;
      // The MOU in force when the booking was placed — not today's.
      const mou = partnerId ? mouInForce(mous.filter((m) => m.partnerId === partnerId), l.order.createdAt) : null;
      const picked = pickRate(category, mou);
      return {
        orderItemId: l.id,
        orderId: l.orderId,
        ratePercent: new Prisma.Decimal(picked.ratePercent.toString()),
        source: picked.source,
        category,
        mouId: picked.mouId,
      };
    });
    return (await this.prisma.orderItemCommissionRate.createMany({ data, skipDuplicates: true })).count;
  }

  private async recordEarnings(activeSince: Date, holdDays: number): Promise<number> {
    const rows = await this.prisma.orderReferralAttribution.findMany({
      where: {
        referralStatusAtBooking: 'ACTIVE',
        partnerStatusAtBooking: 'APPROVED',
        // A booking the partner made themselves (with the patient's OTP) earns for that partner whatever referral
        // link the patient has; any other booking needs the patient's referral to that partner still active.
        OR: [{ bookedByPartner: true }, { patientReferral: { status: 'ACTIVE' } }],
        partner: { status: 'APPROVED' },
        order: {
          // Earned once the report is ready — whether paid online, at the door or at the centre. A cancelled or
          // refunded booking is reversed (a fully refunded one never earns); a partial refund is reversed in part.
          status: 'REPORT_READY',
          paymentStatus: { not: 'REFUNDED' },
          createdAt: { gte: activeSince },
          commissionEntries: { none: { type: 'EARNING' } },
        },
      },
      take: BATCH,
      select: {
        orderId: true,
        partnerId: true,
        order: {
          select: {
            discount: true,
            items: { select: { itemName: true, itemType: true, price: true, commissionRate: { select: { ratePercent: true, category: true } } } },
          },
        },
      },
    });
    const availableAt = new Date(Date.now() + holdDays * 24 * 3600_000);
    const data: Prisma.CommissionEntryCreateManyInput[] = [];
    for (const r of rows) {
      // Every line needs its booking-time rate first; a line without one gets it on this or the next run.
      if (r.order.items.length === 0 || r.order.items.some((i) => !i.commissionRate)) continue;
      const result = orderCommission(
        r.order.items.map((i) => ({
          name: i.itemName,
          itemType: i.itemType as CartItemType,
          priceRupees: i.price,
          ratePercent: i.commissionRate!.ratePercent,
          category: i.commissionRate!.category,
        })),
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

  /**
   * Earned bookings that were cancelled or refunded since. The SQL picks only those where less has been reversed
   * than should be (so a booking already settled is never looked at again); the amount is then worked out with
   * reversalTargetPaise and written as one more REVERSAL row whose seq is the new reversed total.
   */
  private async reverseCancelled(): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      { orderId: string; partnerId: string; earned: number; base: number | null; breakdown: unknown; fully: boolean; refunded: number; reversed: number }[]
    >`
      SELECT e."orderId", e."partnerId", e."amountPaise" AS earned, e."baseRupees" AS base, e."breakdown",
             (o."status" = 'CANCELLED' OR o."paymentStatus" = 'REFUNDED') AS fully,
             o."refundedPaise" AS refunded,
             COALESCE((SELECT SUM(-r."amountPaise") FROM "commission_entries" r WHERE r."orderId" = e."orderId" AND r."type" = 'REVERSAL'), 0)::int AS reversed
      FROM "commission_entries" e
      JOIN "orders" o ON o."id" = e."orderId"
      WHERE e."type" = 'EARNING'
        AND (o."status" = 'CANCELLED' OR o."paymentStatus" = 'REFUNDED' OR o."refundedPaise" > 0)
        AND COALESCE((SELECT SUM(-r."amountPaise") FROM "commission_entries" r WHERE r."orderId" = e."orderId" AND r."type" = 'REVERSAL'), 0) <
            CASE
              WHEN o."status" = 'CANCELLED' OR o."paymentStatus" = 'REFUNDED' OR COALESCE(e."baseRupees", 0) <= 0 THEN e."amountPaise"
              ELSE e."amountPaise" - FLOOR(e."amountPaise"::bigint * GREATEST(0, e."baseRupees"::bigint * 100 - o."refundedPaise") / (e."baseRupees"::bigint * 100))
            END
      ORDER BY e."createdAt"
      LIMIT ${BATCH}
    `;
    const data: Prisma.CommissionEntryCreateManyInput[] = [];
    for (const r of rows) {
      const earned = Number(r.earned);
      const target = reversalTargetPaise(earned, Number(r.base ?? 0), Number(r.refunded), r.fully);
      const step = target - Number(r.reversed);
      if (step <= 0) continue;
      const lines = Array.isArray(r.breakdown) ? (r.breakdown as { name?: string; itemType?: string; category?: string; amountPaise: number }[]) : [];
      data.push({
        partnerId: r.partnerId,
        type: 'REVERSAL',
        orderId: r.orderId,
        amountPaise: -step,
        seq: target,
        breakdown: reversalBreakdown(lines, earned, Number(r.reversed), target) as unknown as Prisma.InputJsonValue,
        note: r.fully ? 'Booking cancelled or refunded' : `Partial refund of ₹${(Number(r.refunded) / 100).toLocaleString('en-IN')} — commission reduced`,
      });
    }
    if (data.length === 0) return 0;
    return (await this.prisma.commissionEntry.createMany({ data, skipDuplicates: true })).count;
  }

  async health() {
    const beat = await this.prisma.referralJobHeartbeat.findUnique({ where: { id: COMMISSION_SWEEPER_ID } });
    return { heartbeat: beat, stale: !beat?.lastSuccessAt || Date.now() - beat.lastSuccessAt.getTime() > 10 * 60_000 };
  }
}
