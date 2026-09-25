import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { haversineKm } from '../common/distance.js';
import { istInstant } from '../common/ist-time.js';

// Either the root client (read-only picker) or an interactive transaction (the locked write path).
type SchedulingDb = Pick<Prisma.TransactionClient, 'order' | 'phlebotomist'>;

export type SchedulableBooking = {
  id: string;
  scheduledDate: Date | null;
  slot: { startTime: string; endTime: string; label?: string } | null;
  address: { lat: number | null; lng: number | null } | null;
  itemCount: number;
};

export type AvailabilityResult = { available: true } | { available: false; reason: string; conflictOrderNumber?: string };

type TimeWindow = { start: Date; end: Date; lat: number | null; lng: number | null };

/**
 * Simple, dependable availability/conflict-checking for HOME-collection phlebotomist
 * assignment — deliberately not a routing/optimization engine. A phlebotomist is available for a
 * candidate booking only if every one of their other reserved (PENDING/ACCEPTED, non-cancelled)
 * HOME bookings on the same calendar date leaves enough time to finish the earlier collection,
 * travel between the two addresses, and clear a configurable safety buffer before the later one
 * starts. Same-day bookings with no slot/date yet (shouldn't happen for HOME orders, but keeps
 * this defensive) are treated as unconstrained rather than blocking a valid assignment.
 */
@Injectable()
export class PhlebotomistSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private collectionDurationMinutes(itemCount: number): number {
    const base = Number(this.config.get('PHLEBO_BASE_COLLECTION_MINUTES', 15));
    const perExtraItem = Number(this.config.get('PHLEBO_PER_ITEM_MINUTES', 5));
    return base + perExtraItem * Math.max(0, itemCount - 1);
  }

  // Deliberately a flat assumed urban driving speed, not a maps/routing integration — the FSD
  // for this feature explicitly asks for a clear, dependable mechanism over a complicated
  // optimization system. Unknown coordinates fall back to a fixed, conservative travel estimate
  // rather than either assuming zero travel time (unsafe) or refusing the assignment outright.
  private travelMinutes(distanceKm: number | null): number {
    if (distanceKm === null) return Number(this.config.get('PHLEBO_UNKNOWN_TRAVEL_MINUTES', 30));
    const kmPerHour = Number(this.config.get('PHLEBO_TRAVEL_SPEED_KMPH', 20));
    return (distanceKm / kmPerHour) * 60;
  }

  private bufferMinutes(): number {
    return Number(this.config.get('PHLEBO_SCHEDULE_BUFFER_MINUTES', 15));
  }

  private toWindow(booking: SchedulableBooking): TimeWindow | null {
    if (!booking.scheduledDate || !booking.slot) return null;
    const dateStr = booking.scheduledDate.toISOString().slice(0, 10);
    const start = istInstant(dateStr, booking.slot.startTime);
    const durationMs = this.collectionDurationMinutes(booking.itemCount) * 60_000;
    return { start, end: new Date(start.getTime() + durationMs), lat: booking.address?.lat ?? null, lng: booking.address?.lng ?? null };
  }

  private fitsAround(candidate: TimeWindow, other: TimeWindow): boolean {
    const distanceKm =
      candidate.lat !== null && candidate.lng !== null && other.lat !== null && other.lng !== null
        ? haversineKm(candidate.lat, candidate.lng, other.lat, other.lng)
        : null;
    const gapMs = (this.travelMinutes(distanceKm) + this.bufferMinutes()) * 60_000;

    // Whichever of the two starts first must finish, travel, and clear the buffer before the
    // other one's start — checked in whichever order actually applies, since a candidate can
    // land either before or after an existing booking on the same day.
    if (candidate.start.getTime() <= other.start.getTime()) {
      return candidate.end.getTime() + gapMs <= other.start.getTime();
    }
    return other.end.getTime() + gapMs <= candidate.start.getTime();
  }

  /**
   * The other bookings that actually count as "reserved" time on this phlebotomist's schedule:
   * every non-cancelled HOME booking still carrying their phlebotomistId that day. Rejection
   * clears phlebotomistId entirely (PhlebotomistOrdersService.rejectAssignment), so a rejected
   * booking drops out via the phlebotomistId filter itself. A NULL assignmentStatus must still
   * block — that's every booking assigned before the accept/reject step existed, which is a real,
   * live assignment; filtering on PENDING/ACCEPTED alone silently ignored those.
   */
  private async reservedBookingsOnDate(db: SchedulingDb, phlebotomistId: string, dateKey: Date, excludeOrderId: string) {
    return db.order.findMany({
      where: {
        id: { not: excludeOrderId },
        phlebotomistId,
        collectionType: 'HOME',
        scheduledDate: dateKey,
        status: { not: 'CANCELLED' },
        OR: [{ assignmentStatus: { in: ['PENDING', 'ACCEPTED'] } }, { assignmentStatus: null }],
      },
      include: { slot: true, address: true, items: { select: { id: true } } },
    });
  }

  /**
   * Serializes every assignment write for one phlebotomist — same transaction-scoped advisory lock
   * pattern as SlotsService.reserveCapacityOrThrow. Without it, two near-simultaneous assignments
   * both pass checkAvailability before either commits and the phlebotomist ends up double-booked.
   * Call inside the same transaction as the re-check and the write; released on commit/rollback.
   */
  async lockPhlebotomist(tx: Prisma.TransactionClient, phlebotomistId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phlebotomist-schedule:${phlebotomistId}`}, 0))`;
  }

  async checkAvailability(phlebotomistId: string, candidate: SchedulableBooking, db: SchedulingDb = this.prisma): Promise<AvailabilityResult> {
    const phlebotomist = await db.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist) return { available: false, reason: 'Phlebotomist not found' };
    if (phlebotomist.status !== 'ACTIVE') return { available: false, reason: `Not currently active (${phlebotomist.status})` };

    const candidateWindow = this.toWindow(candidate);
    if (!candidateWindow) return { available: true };

    const dateStr = candidate.scheduledDate!.toISOString().slice(0, 10);
    const dateKey = new Date(`${dateStr}T00:00:00.000Z`);
    const others = await this.reservedBookingsOnDate(db, phlebotomistId, dateKey, candidate.id);

    for (const other of others) {
      const otherWindow = this.toWindow({
        id: other.id,
        scheduledDate: other.scheduledDate,
        slot: other.slot,
        address: other.address,
        itemCount: other.items.length,
      });
      if (!otherWindow) continue;

      if (!this.fitsAround(candidateWindow, otherWindow)) {
        return {
          available: false,
          reason: `Conflicts with booking ${other.orderNumber} (${other.slot?.label ?? 'same day'})`,
          conflictOrderNumber: other.orderNumber,
        };
      }
    }
    return { available: true };
  }

  /**
   * Candidate list for the "Assign Phlebotomist" picker — every phlebotomist in scope (a lab's
   * own roster, or every phlebotomist for the admin panel's global picker) annotated with
   * whether they're actually assignable to this specific booking, so the UI can show suitable
   * candidates first and disable the rest rather than letting the admin pick blind.
   */
  async listCandidates(phlebotomistIds: string[], candidate: SchedulableBooking) {
    const results = await Promise.all(
      phlebotomistIds.map(async (id) => ({ phlebotomistId: id, ...(await this.checkAvailability(id, candidate)) })),
    );
    return results.sort((a, b) => Number(b.available) - Number(a.available));
  }
}
