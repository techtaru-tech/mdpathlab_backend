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

// Three verdicts, not two: `needsReview` means no time conflict was found but the travel time to a
// same-day booking couldn't be verified (an address has no reliable map location), so the
// assignment can't be auto-approved — a lab/admin must explicitly confirm it.
export type AvailabilityResult =
  | { available: true; needsReview: false }
  | { available: false; needsReview: boolean; reason: string; conflictOrderNumber?: string };

type PairVerdict = 'OK' | 'CONFLICT' | 'UNVERIFIED';

type TimeWindow = { start: Date; end: Date; lat: number | null; lng: number | null };

/**
 * Simple, dependable availability/conflict-checking for HOME-collection phlebotomist
 * assignment — deliberately not a routing/optimization engine. A phlebotomist is available for a
 * candidate booking only if every one of their other reserved (PENDING/ACCEPTED, non-cancelled)
 * HOME bookings on the same calendar date leaves enough time to finish the earlier collection,
 * travel between the two addresses, and clear a configurable safety buffer before the later one
 * starts. If an address involved has no reliable map location the travel time isn't guessed —
 * the result is "needs review" and a lab/admin must confirm it explicitly. Same-day bookings with
 * no slot/date yet (shouldn't happen for HOME orders) are treated as unconstrained.
 */
@Injectable()
export class PhlebotomistSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private collectionDurationMinutes(itemCount: number): number {
    const base = Number(this.config.get('PHLEBO_BASE_COLLECTION_MINUTES', 15));
    const perExtraItem = Number(this.config.get('PHLEBO_PER_ITEM_MINUTES', 2));
    return base + perExtraItem * Math.max(0, itemCount - 1);
  }

  // Deliberately a flat assumed urban driving speed, not a maps/routing integration — the FSD
  // for this feature explicitly asks for a clear, dependable mechanism over a complicated
  // optimization system. Only ever called with a real, computed distance.
  private travelMinutes(distanceKm: number): number {
    const kmPerHour = Number(this.config.get('PHLEBO_TRAVEL_SPEED_KMPH', 20));
    return (distanceKm / kmPerHour) * 60;
  }

  // (0, 0) is what an unset map picker tends to leave behind, not a real Indian address.
  private hasReliableCoords(w: TimeWindow): boolean {
    return w.lat !== null && w.lng !== null && Number.isFinite(w.lat) && Number.isFinite(w.lng) && !(w.lat === 0 && w.lng === 0);
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

  private comparePair(candidate: TimeWindow, other: TimeWindow): PairVerdict {
    // Whichever of the two starts first must finish, travel, and clear the buffer before the
    // other one's start — checked in whichever order actually applies, since a candidate can
    // land either before or after an existing booking on the same day.
    const [first, second] = candidate.start.getTime() <= other.start.getTime() ? [candidate, other] : [other, candidate];
    const bufferMs = this.bufferMinutes() * 60_000;

    // Doesn't fit even with zero travel (same slot, or overlapping) — a hard conflict no matter
    // where either address is, so a missing location can never turn an overlap into a "review".
    if (first.end.getTime() + bufferMs > second.start.getTime()) return 'CONFLICT';

    // Travel time can't be computed, so never approve on an assumed number — needs a human.
    if (!this.hasReliableCoords(first) || !this.hasReliableCoords(second)) return 'UNVERIFIED';

    const travelMs = this.travelMinutes(haversineKm(first.lat!, first.lng!, second.lat!, second.lng!)) * 60_000;
    return first.end.getTime() + travelMs + bufferMs <= second.start.getTime() ? 'OK' : 'CONFLICT';
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
    if (!phlebotomist) return { available: false, needsReview: false, reason: 'Phlebotomist not found' };
    if (phlebotomist.status !== 'ACTIVE') {
      return { available: false, needsReview: false, reason: `Not currently active (${phlebotomist.status})` };
    }

    const candidateWindow = this.toWindow(candidate);
    if (!candidateWindow) return { available: true, needsReview: false };

    const dateStr = candidate.scheduledDate!.toISOString().slice(0, 10);
    const dateKey = new Date(`${dateStr}T00:00:00.000Z`);
    const others = await this.reservedBookingsOnDate(db, phlebotomistId, dateKey, candidate.id);
    let unverifiedAgainst: (typeof others)[number] | null = null;

    for (const other of others) {
      const otherWindow = this.toWindow({
        id: other.id,
        scheduledDate: other.scheduledDate,
        slot: other.slot,
        address: other.address,
        itemCount: other.items.length,
      });
      if (!otherWindow) continue;

      const verdict = this.comparePair(candidateWindow, otherWindow);
      if (verdict === 'CONFLICT') {
        // A real conflict always wins over an unverifiable pair elsewhere on the same day.
        return {
          available: false,
          needsReview: false,
          reason: `Conflicts with booking ${other.orderNumber} (${other.slot?.label ?? 'same day'})`,
          conflictOrderNumber: other.orderNumber,
        };
      }
      if (verdict === 'UNVERIFIED' && !unverifiedAgainst) unverifiedAgainst = other;
    }

    if (unverifiedAgainst) {
      return {
        available: false,
        needsReview: true,
        reason: `Travel time to booking ${unverifiedAgainst.orderNumber} (${unverifiedAgainst.slot?.label ?? 'same day'}) can't be verified — an address has no map location. Confirm manually.`,
        conflictOrderNumber: unverifiedAgainst.orderNumber,
      };
    }
    return { available: true, needsReview: false };
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
    // Available first, then "needs review", then real conflicts.
    const rank = (r: AvailabilityResult) => (r.available ? 0 : r.needsReview ? 1 : 2);
    return results.sort((a, b) => rank(a) - rank(b));
  }
}
