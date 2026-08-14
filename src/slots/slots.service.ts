import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isPastIstSlot } from '../common/ist-time.js';

type PrismaLike = PrismaService | Prisma.TransactionClient;

type ResolvedCapacity =
  | { limited: false }
  | { limited: true; configId: string; capacity: number; occupancyScope: Prisma.OrderWhereInput };

export type SlotAvailabilityView = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
  remainingCapacity: number | null;
};

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private reservationTtlMinutes() {
    return Number(this.config.get('SLOT_RESERVATION_TTL_MINUTES', 30));
  }

  /**
   * Resolves which SlotAvailability row (if any) governs this slot/date/scope, per the
   * documented precedence:
   *   HOME:   (HOME-specific) -> (global) -> unlimited
   *   CENTER: (centre-specific) -> (CENTER-wide) -> (global) -> unlimited
   * Only ever returns a limited result when a row actually exists — there are at most 4 rows per
   * (slotId, date) by construction (see the slot_availability migration's partial indexes), so
   * fetching all of them and picking in JS is simpler than several sequential queries.
   */
  private async resolveApplicableConfig(
    client: PrismaLike,
    slotId: string,
    date: Date,
    collectionType: 'HOME' | 'CENTER',
    collectionCenterId: string | undefined,
  ): Promise<ResolvedCapacity> {
    const rows = await client.slotAvailability.findMany({ where: { slotId, date } });

    if (collectionType === 'HOME') {
      const home = rows.find((r) => r.collectionType === 'HOME');
      if (home) return { limited: true, configId: home.id, capacity: home.capacity, occupancyScope: { slotId, scheduledDate: date, collectionType: 'HOME' } };
      const global = rows.find((r) => r.collectionType === null);
      if (global) return { limited: true, configId: global.id, capacity: global.capacity, occupancyScope: { slotId, scheduledDate: date } };
      return { limited: false };
    }

    const centreSpecific = collectionCenterId ? rows.find((r) => r.collectionType === 'CENTER' && r.collectionCenterId === collectionCenterId) : undefined;
    if (centreSpecific) {
      return {
        limited: true,
        configId: centreSpecific.id,
        capacity: centreSpecific.capacity,
        occupancyScope: { slotId, scheduledDate: date, collectionType: 'CENTER', collectionCenterId },
      };
    }
    const centreWide = rows.find((r) => r.collectionType === 'CENTER' && r.collectionCenterId === null);
    if (centreWide) return { limited: true, configId: centreWide.id, capacity: centreWide.capacity, occupancyScope: { slotId, scheduledDate: date, collectionType: 'CENTER' } };
    const global = rows.find((r) => r.collectionType === null);
    if (global) return { limited: true, configId: global.id, capacity: global.capacity, occupancyScope: { slotId, scheduledDate: date } };
    return { limited: false };
  }

  /** CANCELLED never counts; COD counts immediately and permanently; ONLINE counts while PAID,
   * or while PENDING/FAILED and still within the reservation TTL. No new statuses introduced —
   * this is exactly the existing OrderStatus/PaymentStatus enums, combined. */
  private buildOccupancyWhere(scope: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
    const ttlCutoff = new Date(Date.now() - this.reservationTtlMinutes() * 60 * 1000);
    return {
      ...scope,
      status: { not: 'CANCELLED' },
      OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }, { paymentStatus: { in: ['PENDING', 'FAILED'] }, createdAt: { gte: ttlCutoff } }],
    };
  }

  /** Parses a "YYYY-MM-DD" string into the same UTC-midnight Date value OrdersService uses for
   * Order.scheduledDate — an opaque calendar-day key, never used as an instant to compare against
   * "now" (that's istInstant/isPastIstSlot's job). */
  static dateKey(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /** Read-only availability list for the public GET /slots endpoint — no locking, since nothing
   * is being reserved here. */
  async getAvailability(dateStr: string, collectionType: 'HOME' | 'CENTER', collectionCenterId: string | undefined): Promise<SlotAvailabilityView[]> {
    const slots = await this.prisma.slot.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const date = SlotsService.dateKey(dateStr);

    return Promise.all(
      slots.map(async (slot) => {
        const base = { id: slot.id, label: slot.label, startTime: slot.startTime, endTime: slot.endTime };
        if (isPastIstSlot(dateStr, slot.startTime)) return { ...base, available: false, remainingCapacity: null };

        const resolved = await this.resolveApplicableConfig(this.prisma, slot.id, date, collectionType, collectionCenterId);
        if (!resolved.limited) return { ...base, available: true, remainingCapacity: null };

        const occupied = await this.prisma.order.count({ where: this.buildOccupancyWhere(resolved.occupancyScope) });
        const remaining = Math.max(0, resolved.capacity - occupied);
        return { ...base, available: remaining > 0, remainingCapacity: remaining };
      }),
    );
  }

  /**
   * Occupancy for a SPECIFIC, already-known SlotAvailability row — used by the admin listing to
   * show "Booked"/"Remaining" per configured row. Reuses buildOccupancyWhere(), the exact same
   * occupancy rule reserveCapacityOrThrow()/getAvailability() use — there is no separate booked
   * counter anywhere; this only builds the scope filter for a row whose precedence has already
   * been decided (by the admin having created it at that specific scope), so it does not need
   * resolveApplicableConfig()'s precedence search.
   */
  async getOccupancyForRow(row: { slotId: string; date: Date; collectionType: 'HOME' | 'CENTER' | null; collectionCenterId: string | null }): Promise<number> {
    const scope: Prisma.OrderWhereInput = {
      slotId: row.slotId,
      scheduledDate: row.date,
      ...(row.collectionType ? { collectionType: row.collectionType } : {}),
      ...(row.collectionCenterId ? { collectionCenterId: row.collectionCenterId } : {}),
    };
    return this.prisma.order.count({ where: this.buildOccupancyWhere(scope) });
  }

  /**
   * Called inside OrdersService.checkout()'s transaction, after the slot's own isActive/past-time
   * checks. If no SlotAvailability row applies, this is a no-op (unlimited — today's behavior for
   * every real slot, since none are configured). Otherwise it takes a transaction-scoped Postgres
   * advisory lock keyed on the resolved config row's own id — which is exactly the capacity scope
   * being evaluated, so two bookings that resolve to different scopes (e.g. two different
   * centres' centre-specific rows) never contend for the same lock — then re-counts occupancy
   * inside that lock and rejects if it's already at capacity. This is never a bare
   * count()-then-create(): the lock serializes every concurrent attempt against this exact scope,
   * so the count a request sees is always up to date with every other request that has already
   * committed.
   */
  async reserveCapacityOrThrow(
    tx: Prisma.TransactionClient,
    slotId: string,
    dateStr: string,
    collectionType: 'HOME' | 'CENTER',
    collectionCenterId: string | undefined,
  ): Promise<void> {
    const date = SlotsService.dateKey(dateStr);
    const resolved = await this.resolveApplicableConfig(tx, slotId, date, collectionType, collectionCenterId);
    if (!resolved.limited) return;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resolved.configId}, 0))`;

    const occupied = await tx.order.count({ where: this.buildOccupancyWhere(resolved.occupancyScope) });
    if (occupied >= resolved.capacity) {
      throw new BadRequestException('This slot is fully booked for the selected date');
    }
  }
}
