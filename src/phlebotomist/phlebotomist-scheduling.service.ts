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
// `note`/`plannedStart` explain an available result: the internal time the phlebotomist would do
// this visit, which can be later than the slot's start when it follows another visit in the same
// or an adjacent slot. The customer-facing slot itself never changes.
export type AvailabilityResult =
  | { available: true; needsReview: false; plannedStart: Date | null; note: string | null }
  | { available: false; needsReview: boolean; reason: string; conflictOrderNumber?: string };

// One visit on the phlebotomist's day: the customer's slot is the window it must happen inside.
type Visit = {
  id: string;
  orderNumber: string;
  slotLabel: string;
  windowStart: number;
  windowEnd: number;
  durationMs: number;
  lat: number | null;
  lng: number | null;
  isCandidate: boolean;
};

type Plan = {
  start: Map<string, number>;
  missed: Set<string>; // visits that can't finish inside their own window
  previous: Map<string, Visit | null>;
  unverifiedWith: Visit | null; // first visit whose leg to/from the candidate has no reliable location
};

/**
 * Simple, dependable availability/conflict-checking for HOME-collection phlebotomist
 * assignment — deliberately not a routing/optimization engine. The customer's slot is a window,
 * not an exact start time: the phlebotomist's visits that day are laid out one after another
 * (see plan()), and a new booking is available only if it and every visit it shares the day with
 * can still be collected — finishing previous visits, travelling, and clearing a configurable
 * safety buffer — inside their own windows. If a leg touching the new booking has no reliable map
 * location the travel time isn't guessed: the result is "needs review" and a lab/admin must
 * confirm it explicitly. Bookings with no slot/date (shouldn't happen for HOME) are unconstrained.
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
  private hasReliableCoords(w: { lat: number | null; lng: number | null }): boolean {
    return w.lat !== null && w.lng !== null && Number.isFinite(w.lat) && Number.isFinite(w.lng) && !(w.lat === 0 && w.lng === 0);
  }

  private bufferMinutes(): number {
    return Number(this.config.get('PHLEBO_SCHEDULE_BUFFER_MINUTES', 15));
  }

  private toVisit(booking: SchedulableBooking, orderNumber: string, isCandidate: boolean): Visit | null {
    if (!booking.scheduledDate || !booking.slot) return null;
    const dateStr = booking.scheduledDate.toISOString().slice(0, 10);
    const windowStart = istInstant(dateStr, booking.slot.startTime).getTime();
    const durationMs = this.collectionDurationMinutes(booking.itemCount) * 60_000;
    let windowEnd = istInstant(dateStr, booking.slot.endTime).getTime();
    // A malformed slot (end not after start) degrades to "must start right at the slot start".
    if (windowEnd <= windowStart) windowEnd = windowStart + durationMs;
    return {
      id: booking.id,
      orderNumber,
      slotLabel: booking.slot.label ?? `${booking.slot.startTime}-${booking.slot.endTime}`,
      windowStart,
      windowEnd,
      durationMs,
      lat: booking.address?.lat ?? null,
      lng: booking.address?.lng ?? null,
      isCandidate,
    };
  }

  /**
   * Lays the day's visits out one after another, earliest window first (existing visits keep
   * their place ahead of the new one within the same window). Each visit starts at the later of
   * its window start and (previous visit end + travel + buffer), and must finish inside its own
   * window — so two bookings in the same slot get sequential internal times, never the same one.
   * A leg with no reliable location counts as zero travel here (only ever optimistic), and is
   * reported via `unverifiedWith` when it touches the new booking so the caller can require review.
   */
  private plan(visits: Visit[]): Plan {
    const ordered = [...visits].sort(
      (a, b) => a.windowStart - b.windowStart || Number(a.isCandidate) - Number(b.isCandidate) || a.id.localeCompare(b.id),
    );
    const bufferMs = this.bufferMinutes() * 60_000;
    const result: Plan = { start: new Map(), missed: new Set(), previous: new Map(), unverifiedWith: null };

    let prev: { visit: Visit; end: number } | null = null;
    for (const v of ordered) {
      let earliest = v.windowStart;
      if (prev) {
        let travelMs = 0;
        if (this.hasReliableCoords(prev.visit) && this.hasReliableCoords(v)) {
          travelMs = this.travelMinutes(haversineKm(prev.visit.lat!, prev.visit.lng!, v.lat!, v.lng!)) * 60_000;
        } else if ((prev.visit.isCandidate || v.isCandidate) && !result.unverifiedWith) {
          result.unverifiedWith = prev.visit.isCandidate ? v : prev.visit;
        }
        earliest = Math.max(earliest, prev.end + travelMs + bufferMs);
      }
      const end = earliest + v.durationMs;
      if (end > v.windowEnd) result.missed.add(v.id);
      result.start.set(v.id, earliest);
      result.previous.set(v.id, prev?.visit ?? null);
      prev = { visit: v, end };
    }
    return result;
  }

  private formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
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

    const candidateVisit = this.toVisit(candidate, 'this booking', true);
    if (!candidateVisit) return { available: true, needsReview: false, plannedStart: null, note: null };

    const dateStr = candidate.scheduledDate!.toISOString().slice(0, 10);
    const dateKey = new Date(`${dateStr}T00:00:00.000Z`);
    const others = await this.reservedBookingsOnDate(db, phlebotomistId, dateKey, candidate.id);
    const existing = others
      .map((o) =>
        this.toVisit(
          { id: o.id, scheduledDate: o.scheduledDate, slot: o.slot, address: o.address, itemCount: o.items.length },
          o.orderNumber,
          false,
        ),
      )
      .filter((v): v is Visit => v !== null);

    // A day that already doesn't fit (existing data) must not block an unrelated new booking —
    // only visits the new booking itself pushes out of their window count against it.
    const baseline = this.plan(existing);
    const withCandidate = this.plan([...existing, candidateVisit]);
    const pushedOut = existing.filter((v) => withCandidate.missed.has(v.id) && !baseline.missed.has(v.id));

    if (withCandidate.missed.has(candidateVisit.id)) {
      const before = withCandidate.previous.get(candidateVisit.id) ?? null;
      const earliest = withCandidate.start.get(candidateVisit.id)!;
      return {
        available: false,
        needsReview: false,
        reason: before
          ? `Conflicts with booking ${before.orderNumber} (${before.slotLabel}) — after that visit, travel and buffer, the earliest start is ${this.formatTime(earliest)}, too late to finish within ${candidateVisit.slotLabel}`
          : `The collection doesn't fit within ${candidateVisit.slotLabel}`,
        ...(before ? { conflictOrderNumber: before.orderNumber } : {}),
      };
    }
    if (pushedOut.length > 0) {
      const displaced = pushedOut[0]!;
      return {
        available: false,
        needsReview: false,
        reason: `Conflicts with booking ${displaced.orderNumber} (${displaced.slotLabel}) — adding this visit would make it finish after its slot`,
        conflictOrderNumber: displaced.orderNumber,
      };
    }

    // Travel time can't be computed, so never approve on an assumed number — needs a human.
    if (withCandidate.unverifiedWith) {
      const other = withCandidate.unverifiedWith;
      return {
        available: false,
        needsReview: true,
        reason: `Travel time to booking ${other.orderNumber} (${other.slotLabel}) can't be verified — an address has no map location. Confirm manually.`,
        conflictOrderNumber: other.orderNumber,
      };
    }

    const plannedStart = withCandidate.start.get(candidateVisit.id)!;
    const before = withCandidate.previous.get(candidateVisit.id) ?? null;
    const note =
      plannedStart > candidateVisit.windowStart && before
        ? `Visit around ${this.formatTime(plannedStart)}, after booking ${before.orderNumber}`
        : null;
    return { available: true, needsReview: false, plannedStart: new Date(plannedStart), note };
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
