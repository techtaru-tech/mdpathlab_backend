import { PhlebotomistSchedulingService, type SchedulableBooking } from './phlebotomist-scheduling.service';

// Real coordinates around the Jaipur lab. Distances from NEAR: CLOSE ≈ 0.6 km, NEARBY ≈ 2.39 km,
// FAR ≈ 16.03 km, VERY_FAR ≈ 30 km (90 min at the default 20 km/h).
const NEAR = { lat: 26.8467, lng: 75.7873 };
const CLOSE = { lat: 26.8521, lng: 75.7873 };
const NEARBY = { lat: 26.865, lng: 75.8 };
const FAR = { lat: 26.95, lng: 75.9 };
const VERY_FAR = { lat: 27.1167, lng: 75.7873 };
const NO_COORDS = { lat: null, lng: null };
const DATE = new Date('2026-10-01T00:00:00.000Z');

function slot(start: string) {
  const [h] = start.split(':').map(Number);
  const end = `${String(h + 1).padStart(2, '0')}:00`;
  return { startTime: start, endTime: end, label: `${start}-${end}` };
}

function candidate(start: string, address: { lat: number | null; lng: number | null }, itemCount = 1): SchedulableBooking {
  return { id: 'candidate', scheduledDate: DATE, slot: slot(start), address, itemCount };
}

function existing(orderNumber: string, start: string, address: { lat: number | null; lng: number | null }, itemCount = 1) {
  return {
    id: orderNumber,
    orderNumber,
    scheduledDate: DATE,
    slot: slot(start),
    address,
    items: Array.from({ length: itemCount }, (_, i) => ({ id: `${orderNumber}-item-${i}` })),
  };
}

function makeDb(others: ReturnType<typeof existing>[], phlebotomistStatus = 'ACTIVE') {
  return {
    phlebotomist: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: phlebotomistStatus }) },
    order: { findMany: jest.fn().mockResolvedValue(others) },
  };
}

function makeService(db: ReturnType<typeof makeDb>, config: Record<string, number> = {}) {
  const configService = { get: (key: string, fallback: unknown) => (key in config ? config[key] : fallback) };
  return new PhlebotomistSchedulingService(db as never, configService as never);
}

// IST wall-clock minutes-past-midnight of a planned start, for readable assertions.
function istMinutes(d: Date | null | undefined) {
  if (!d) return null;
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

async function check(others: ReturnType<typeof existing>[], cand: SchedulableBooking, config?: Record<string, number>) {
  const db = makeDb(others);
  return makeService(db, config).checkAvailability('p1', cand, db as never);
}

describe('PhlebotomistSchedulingService — new assignments', () => {
  it('allows a phlebotomist with no other bookings that day, at the slot start', async () => {
    const result = await check([], candidate('07:00', NEAR));
    expect(result).toMatchObject({ available: true, needsReview: false, note: null });
    expect(istMinutes(result.available ? result.plannedStart : null)).toBe(7 * 60);
  });

  describe('same customer slot is a window, not an exact start time', () => {
    it('allows two visits ~600 m apart in the same slot, one after the other (the reported case)', async () => {
      // A: 14:00 + 19 min (3 tests). B: + ~2 min travel + 15 min buffer → ~14:36, done ~14:51 < 15:00.
      const result = await check([existing('A', '14:00', NEAR, 3)], candidate('14:00', CLOSE));
      expect(result).toMatchObject({ available: true, needsReview: false });
      if (!result.available) throw new Error('expected available');
      expect(istMinutes(result.plannedStart)).toBe(14 * 60 + 35);
      expect(result.note).toBe('Visit around 2:35 pm, after booking A');
    });

    it('never gives two visits the same actual collection time, even at the same address', async () => {
      const result = await check([existing('A', '07:00', NEAR)], candidate('07:00', NEAR));
      if (!result.available) throw new Error('expected available');
      // A runs 07:00–07:15; this one waits for the buffer: 07:30.
      expect(istMinutes(result.plannedStart)).toBe(7 * 60 + 30);
    });

    it('blocks a same-slot visit when collection + travel + buffer cannot finish inside the slot', async () => {
      // A 07:00–07:15, + ~48 min (16 km) + 15 min buffer → 08:18, after the 08:00 slot end.
      const result = await check([existing('A', '07:00', NEAR)], candidate('07:00', FAR));
      expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'A' });
      if (result.available) throw new Error('expected conflict');
      expect(result.reason).toContain('earliest start is 8:18 am');
    });

    it('blocks a third same-slot visit that no longer fits in the hour', async () => {
      // A 07:00–07:15, B ~07:37–07:52, a third would start ~08:14 → past 08:00.
      const result = await check([existing('A', '07:00', NEAR), existing('B', '07:00', NEARBY)], candidate('07:00', NEAR));
      expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'B' });
    });
  });

  it('allows the next slot when the previous visit, travel and buffer leave room (16 km, starts later in its window)', async () => {
    // A 10:00–10:15, + ~48 min + 15 min → 11:18, done 11:33 inside 11:00–12:00.
    const result = await check([existing('A', '10:00', NEAR)], candidate('11:00', FAR));
    if (!result.available) throw new Error('expected available');
    expect(istMinutes(result.plannedStart)).toBe(11 * 60 + 18);
  });

  it('blocks the next slot when travel alone exceeds the window (30 km)', async () => {
    // A 07:00–07:15, + 90 min + 15 min → 09:00, done 09:15 — past the 08:00–09:00 slot.
    const result = await check([existing('A', '07:00', NEAR)], candidate('08:00', VERY_FAR));
    expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'A' });
  });

  it('blocks a new earlier visit that would push an existing booking out of its own slot', async () => {
    // New 07:00–07:15, then 90 min + 15 min → existing A would start 09:00 and end 09:15 > 09:00.
    const result = await check([existing('A', '08:00', VERY_FAR)], candidate('07:00', NEAR));
    expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'A' });
    if (result.available) throw new Error('expected conflict');
    expect(result.reason).toContain('would make it finish after its slot');
  });

  it('does not let an already-inconsistent day block an unrelated later booking', async () => {
    // A and B (07:00, 16 km apart) can't both happen — pre-existing data. A 12:00 booking is unrelated.
    const result = await check([existing('A', '07:00', NEAR), existing('B', '07:00', FAR)], candidate('12:00', NEAR));
    expect(result).toMatchObject({ available: true });
  });

  describe('extra-test collection time (default 2 min per extra test)', () => {
    it('lets a 6-test booking be followed by a nearby next-slot booking', async () => {
      const result = await check([existing('A', '10:00', NEAR, 6)], candidate('11:00', NEARBY));
      expect(result.available).toBe(true);
    });

    it('still honours an explicit PHLEBO_PER_ITEM_MINUTES override', async () => {
      // 4 tests: 21 min at 2 min/test → same-slot follow-up ends ~07:58 (fits); at 5 min/test → 30 min → ~08:07 (does not).
      expect((await check([existing('A', '07:00', NEAR, 4)], candidate('07:00', NEARBY))).available).toBe(true);
      const withOverride = await check([existing('A', '07:00', NEAR, 4)], candidate('07:00', NEARBY), { PHLEBO_PER_ITEM_MINUTES: 5 });
      expect(withOverride).toMatchObject({ available: false, needsReview: false });
    });
  });

  describe('missing coordinates', () => {
    it('needs manual review instead of assuming a travel time (new booking has no location)', async () => {
      const result = await check([existing('A', '07:00', NEAR)], candidate('08:00', NO_COORDS));
      expect(result).toMatchObject({ available: false, needsReview: true, conflictOrderNumber: 'A' });
    });

    it('needs manual review when the other booking has no location', async () => {
      const result = await check([existing('A', '07:00', NO_COORDS)], candidate('08:00', FAR));
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('needs review (never auto-approved) for a same-slot pair when a location is missing', async () => {
      const result = await check([existing('A', '07:00', NO_COORDS)], candidate('07:00', NEAR));
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('is a hard conflict (not a review) when it could not fit even with zero travel', async () => {
      const result = await check([existing('A', '07:00', NEAR), existing('B', '07:00', NEARBY)], candidate('07:00', NO_COORDS));
      expect(result).toMatchObject({ available: false, needsReview: false });
    });

    it('treats (0, 0) as an unreliable location', async () => {
      const result = await check([existing('A', '07:00', NEAR)], candidate('08:00', { lat: 0, lng: 0 }));
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('does not need review when there is nothing else to travel between', async () => {
      const result = await check([], candidate('07:00', NO_COORDS));
      expect(result).toMatchObject({ available: true, needsReview: false });
    });

    it('reports a real conflict over an unverifiable pair on the same day', async () => {
      const result = await check([existing('UNMAPPED', '09:00', NO_COORDS), existing('CLASH', '07:00', FAR)], candidate('07:00', NEAR));
      expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'CLASH' });
    });
  });

  it.each(['ON_LEAVE', 'INACTIVE'])('never assigns a %s phlebotomist (not even via review)', async (status) => {
    const db = makeDb([], status);
    const result = await makeService(db).checkAvailability('p1', candidate('07:00', NEAR), db as never);
    expect(result).toMatchObject({ available: false, needsReview: false });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('only counts live, non-cancelled assignments (including ones with no accept/reject status yet)', async () => {
    const db = makeDb([]);
    await makeService(db).checkAvailability('p1', candidate('07:00', NEAR), db as never);
    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: { not: 'candidate' },
      phlebotomistId: 'p1',
      collectionType: 'HOME',
      status: { not: 'CANCELLED' },
    });
    expect(where.OR).toEqual([{ assignmentStatus: { in: ['PENDING', 'ACCEPTED'] } }, { assignmentStatus: null }]);
  });

  it('orders picker candidates available → needs review → conflict', async () => {
    const byPhlebo: Record<string, ReturnType<typeof existing>[]> = {
      conflict: [existing('A', '07:00', FAR)],
      review: [existing('B', '08:00', NO_COORDS)],
      free: [],
    };
    const db = {
      phlebotomist: { findUnique: jest.fn(({ where }) => Promise.resolve({ id: where.id, status: 'ACTIVE' })) },
      order: { findMany: jest.fn(({ where }) => Promise.resolve(byPhlebo[where.phlebotomistId])) },
    };
    const results = await makeService(db as never).listCandidates(['conflict', 'review', 'free'], candidate('07:00', NEAR));
    expect(results.map((r) => r.phlebotomistId)).toEqual(['free', 'review', 'conflict']);
  });
});
