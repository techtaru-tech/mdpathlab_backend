import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FeatureSwitches } from '../partners/feature-switches.js';
import { REFERRAL_POLICY_VERSION, partnerStatusAt, referralStateAt, type PartnerStatus, type ReferralStatus } from './referral-policy.js';

export const SWEEPER_ID = 'snapshot-sweeper';
const RUN_EVERY_MS = 60_000;
const BATCH = 200;
const MAX_ATTEMPTS = 5;
const BACKLOG_GRACE_MINUTES = 5;

type Candidate = { id: string; userId: string; createdAt: Date };

/**
 * Writes the per-order referral snapshot AFTER the booking committed — the booking path (cart, checkout, payments,
 * home visits, add-ons) has no referral code in it at all, so a referral problem can never fail or slow a booking.
 *
 * Every minute (only while referrals are switched on in admin settings) it finds orders of referred patients, placed at or after the
 * binding, that have no snapshot yet, and records the partner and statuses AS THEY WERE when the order was placed
 * (replayed from the append-only histories). Idempotent: orderId is unique and inserts skip duplicates, so a second
 * run, a parallel instance or an admin retry can never create two rows. A failing order is retried every run and
 * flagged for an admin after 5 attempts; the rest of the batch is unaffected.
 */
@Injectable()
export class ReferralSnapshotSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReferralSnapshots');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveRunErrors = 0;
  private lastRunAlertAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly switches: FeatureSwitches,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // The switch can be flipped at any time from admin settings, so the timer always runs and each tick checks it
    // (one cached read); while referrals are off a tick does nothing.
    const tick = () =>
      void (async () => {
        if (await this.switches.referralsEnabled()) await this.runOnce();
      })().catch((err) => this.logger.error(`Snapshot run failed: ${(err as Error).message}`));
    setTimeout(tick, 10_000).unref();
    this.timer = setInterval(tick, RUN_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private candidatesSql(limit: number | null, olderThanMinutes = 0) {
    return Prisma.sql`
      SELECT o.id, o."userId", o."createdAt"
      FROM orders o
      JOIN patient_referrals pr ON pr."userId" = o."userId"
      LEFT JOIN order_referral_attributions a ON a."orderId" = o.id
      LEFT JOIN referral_snapshot_failures f ON f."orderId" = o.id
      WHERE a.id IS NULL
        AND o."createdAt" >= pr."boundAt"
        AND (f."orderId" IS NULL OR f."needsAttention" = false)
        -- Prisma stores timestamps as UTC without a zone; the session zone may be IST, so compare in UTC.
        -- Prisma binds JS numbers as bigint; make_interval only accepts int, hence the cast (found in Gate 2C).
        AND o."createdAt" <= (now() AT TIME ZONE 'UTC') - make_interval(mins => ${olderThanMinutes}::int)
      ORDER BY o."createdAt"
      ${limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}`;
  }

  /** One pass. Returns what it did; never throws for a single bad order. */
  async runOnce(): Promise<{ processed: number; failed: number; skipped?: boolean }> {
    if (this.running) return { processed: 0, failed: 0, skipped: true };
    this.running = true;
    const startedAt = new Date();
    let processed = 0;
    let failed = 0;
    try {
      const batch = await this.prisma.$queryRaw<Candidate[]>(this.candidatesSql(BATCH));
      for (const order of batch) {
        const ok = await this.processOrder(order, 'SWEEPER');
        if (ok) processed++;
        else failed++;
      }
      const backlog = await this.prisma.$queryRaw<{ n: bigint }[]>(
        Prisma.sql`SELECT count(*) AS n FROM (${this.candidatesSql(null, BACKLOG_GRACE_MINUTES)}) q`,
      );
      await this.heartbeat({ lastRunAt: startedAt, lastSuccessAt: startedAt, lastProcessed: processed, lastBacklog: Number(backlog[0]?.n ?? 0), lastError: null });
      this.consecutiveRunErrors = 0;
      return { processed, failed };
    } catch (err) {
      this.consecutiveRunErrors++;
      const message = (err as Error).message.slice(0, 500);
      await this.heartbeat({ lastRunAt: startedAt, lastError: message }).catch(() => undefined);
      if (this.consecutiveRunErrors >= 3 && Date.now() - this.lastRunAlertAt > 3600_000) {
        this.lastRunAlertAt = Date.now();
        await this.notifications.notifyAdmins({
          title: 'Referral tracking needs attention',
          body: 'Booking attribution has failed several times in a row. Bookings are unaffected; check the referral health screen.',
          data: { type: 'REFERRAL_SNAPSHOT_FAILING' },
        });
      }
      throw err;
    } finally {
      this.running = false;
    }
  }

  private heartbeat(data: { lastRunAt: Date; lastSuccessAt?: Date; lastProcessed?: number; lastBacklog?: number; lastError: string | null }) {
    return this.prisma.referralJobHeartbeat.upsert({ where: { id: SWEEPER_ID }, create: { id: SWEEPER_ID, ...data }, update: data });
  }

  /** Records one order's snapshot (or its failure). Returns true when the order now has a snapshot. */
  async processOrder(order: Candidate, recordedBy: 'SWEEPER' | 'ADMIN_RETRY'): Promise<boolean> {
    try {
      const referral = await this.prisma.patientReferral.findUnique({
        where: { userId: order.userId },
        include: { events: { select: { event: true, toPartnerId: true, toStatus: true, createdAt: true } } },
      });
      if (!referral) throw new Error('patient has no referral');
      const state = referralStateAt(referral.events as { event: string; toPartnerId: string | null; toStatus: ReferralStatus | null; createdAt: Date }[], order.createdAt);
      if (!state) throw new Error('order is older than the referral binding');
      const partner = await this.prisma.referralPartner.findUnique({
        where: { id: state.partnerId },
        select: { status: true, events: { where: { toStatus: { not: null } }, select: { toStatus: true, createdAt: true } } },
      });
      if (!partner) throw new Error('referral partner not found');

      await this.prisma.orderReferralAttribution.createMany({
        data: [
          {
            orderId: order.id,
            userId: order.userId,
            partnerId: state.partnerId,
            patientReferralId: referral.id,
            referralStatusAtBooking: state.status,
            partnerStatusAtBooking: partnerStatusAt(partner.events as { toStatus: PartnerStatus | null; createdAt: Date }[], order.createdAt, partner.status),
            policyVersion: REFERRAL_POLICY_VERSION,
            orderCreatedAt: order.createdAt,
            recordedBy,
          },
        ],
        skipDuplicates: true,
      });
      await this.prisma.referralSnapshotFailure.deleteMany({ where: { orderId: order.id } });
      return true;
    } catch (err) {
      await this.recordFailure(order.id, (err as Error).message).catch((e) => this.logger.error(`Could not record snapshot failure: ${(e as Error).message}`));
      return false;
    }
  }

  private async recordFailure(orderId: string, message: string) {
    const lastError = message.slice(0, 500);
    const failure = await this.prisma.referralSnapshotFailure.upsert({
      where: { orderId },
      create: { orderId, lastError },
      update: { attempts: { increment: 1 }, lastError, lastAttemptAt: new Date() },
    });
    if (failure.attempts >= MAX_ATTEMPTS && !failure.needsAttention) {
      await this.prisma.referralSnapshotFailure.update({ where: { orderId }, data: { needsAttention: true } });
      this.logger.warn(`Referral snapshot for order ${orderId} failed ${failure.attempts} times — flagged for an admin`);
      await this.notifications.notifyAdmins({
        title: 'A booking could not be attributed',
        body: 'Referral attribution for one booking failed repeatedly. The booking itself is fine; retry it from the referral health screen.',
        data: { type: 'REFERRAL_SNAPSHOT_FAILED', orderId },
      });
    }
  }

  /** Admin "retry": also covers orders already flagged for attention. Never overwrites an existing snapshot. */
  async retry(orderId: string) {
    const rows = await this.prisma.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT o.id, o."userId", o."createdAt" FROM orders o
      JOIN patient_referrals pr ON pr."userId" = o."userId"
      WHERE o.id = ${orderId} AND o."createdAt" >= pr."boundAt"`);
    if (rows.length === 0) return { recorded: false, reason: 'This booking is not from a referred patient (or predates the referral)' };
    const exists = await this.prisma.orderReferralAttribution.findUnique({ where: { orderId }, select: { id: true } });
    if (exists) return { recorded: true, reason: 'Already recorded' };
    await this.prisma.referralSnapshotFailure.updateMany({ where: { orderId }, data: { needsAttention: false } });
    const ok = await this.processOrder(rows[0]!, 'ADMIN_RETRY');
    return { recorded: ok, reason: ok ? 'Recorded' : 'Still failing — see the error on the health screen' };
  }

  async health() {
    const [beat, flagged, failing] = await Promise.all([
      this.prisma.referralJobHeartbeat.findUnique({ where: { id: SWEEPER_ID } }),
      this.prisma.referralSnapshotFailure.findMany({ where: { needsAttention: true }, orderBy: { lastAttemptAt: 'desc' }, take: 50 }),
      this.prisma.referralSnapshotFailure.count({ where: { needsAttention: false } }),
    ]);
    const stale = !beat?.lastSuccessAt || Date.now() - beat.lastSuccessAt.getTime() > 15 * 60_000;
    return { enabled: await this.switches.referralsEnabled(), heartbeat: beat, stale, retrying: failing, needsAttention: flagged };
  }
}
