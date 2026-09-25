import { PhlebotomistSchedulingService, type SchedulableBooking } from './phlebotomist-scheduling.service';

// Real coordinates: NEAR is the Jaipur lab's area, NEARBY ≈ 2.39 km from it, FAR ≈ 16.03 km.
const NEAR = { lat: 26.8467, lng: 75.7873 };
const NEARBY = { lat: 26.865, lng: 75.8 };
const FAR = { lat: 26.95, lng: 75.9 };
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

describe('PhlebotomistSchedulingService — new assignments', () => {
  it('allows a phlebotomist with no other bookings that day', async () => {
    const db = makeDb([]);
    const result = await makeService(db).checkAvailability('p1', candidate('07:00', NEAR), db as never);
    expect(result).toEqual({ available: true, needsReview: false });
  });

  it('blocks the same slot at a different location', async () => {
    const db = makeDb([existing('A', '07:00', NEAR)]);
    const result = await makeService(db).checkAvailability('p1', candidate('07:00', NEARBY), db as never);
    expect(result).toMatchObject({ available: false, needsReview: false, conflictOrderNumber: 'A' });
  });

  it('allows nearby back-to-back bookings when collection + travel + buffer fit', async () => {
    const db = makeDb([existing('A', '08:00', NEAR)]);
    // 08:00 + 15 min collection + ~7 min travel (2.4 km) + 15 min buffer = 08:37, before 09:00.
    const result = await makeService(db).checkAvailability('p1', candidate('09:00', NEARBY), db as never);
    expect(result.available).toBe(true);
  });

  it('blocks back-to-back bookings when travel time is insufficient', async () => {
    const db = makeDb([existing('A', '10:00', NEAR)]);
    // 10:00 + 15 min + ~48 min travel (16 km) + 15 min buffer = 11:18, after 11:00.
    const result = await makeService(db).checkAvailability('p1', candidate('11:00', FAR), db as never);
    expect(result).toMatchObject({ available: false, needsReview: false });
  });

  it('checks the new booking when it lands BEFORE an existing one too', async () => {
    const db = makeDb([existing('A', '11:00', FAR)]);
    const result = await makeService(db).checkAvailability('p1', candidate('10:00', NEAR), db as never);
    expect(result).toMatchObject({ available: false, needsReview: false });
  });

  describe('extra-test collection time (default 2 min per extra test)', () => {
    it('lets a 6-test booking be followed by a nearby next-slot booking', async () => {
      const db = makeDb([existing('A', '10:00', NEAR, 6)]);
      // 15 + 2×5 = 25 min collection, + ~7 min travel + 15 min buffer = 10:47, before 11:00.
      const result = await makeService(db).checkAvailability('p1', candidate('11:00', NEARBY), db as never);
      expect(result.available).toBe(true);
    });

    it('still honours an explicit PHLEBO_PER_ITEM_MINUTES override', async () => {
      const db = makeDb([existing('A', '10:00', NEAR, 6)]);
      const result = await makeService(db, { PHLEBO_PER_ITEM_MINUTES: 5 }).checkAvailability('p1', candidate('11:00', NEARBY), db as never);
      expect(result).toMatchObject({ available: false, needsReview: false });
    });
  });

  describe('missing coordinates', () => {
    it('needs manual review instead of assuming a travel time (new booking has no location)', async () => {
      const db = makeDb([existing('A', '07:00', NEAR)]);
      const result = await makeService(db).checkAvailability('p1', candidate('08:00', NO_COORDS), db as never);
      expect(result).toMatchObject({ available: false, needsReview: true, conflictOrderNumber: 'A' });
    });

    it('needs manual review when the other booking has no location', async () => {
      const db = makeDb([existing('A', '07:00', NO_COORDS)]);
      const result = await makeService(db).checkAvailability('p1', candidate('08:00', FAR), db as never);
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('never approves on an assumed travel time, even with a two-hour gap', async () => {
      const db = makeDb([existing('A', '07:00', NO_COORDS)]);
      const result = await makeService(db).checkAvailability('p1', candidate('09:00', NEAR), db as never);
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('treats (0, 0) as an unreliable location', async () => {
      const db = makeDb([existing('A', '07:00', NEAR)]);
      const result = await makeService(db).checkAvailability('p1', candidate('08:00', { lat: 0, lng: 0 }), db as never);
      expect(result).toMatchObject({ available: false, needsReview: true });
    });

    it('is still a hard conflict (not a review) when the times overlap', async () => {
      const db = makeDb([existing('A', '07:00', NO_COORDS)]);
      const result = await makeService(db).checkAvailability('p1', candidate('07:00', NEAR), db as never);
      expect(result).toMatchObject({ available: false, needsReview: false });
    });

    it('does not need review when there is nothing else to travel between', async () => {
      const db = makeDb([]);
      const result = await makeService(db).checkAvailability('p1', candidate('07:00', NO_COORDS), db as never);
      expect(result).toEqual({ available: true, needsReview: false });
    });

    it('reports a real conflict over an unverifiable pair on the same day', async () => {
      const db = makeDb([existing('UNMAPPED', '09:00', NO_COORDS), existing('CLASH', '07:00', NEARBY)]);
      const result = await makeService(db).checkAvailability('p1', candidate('07:00', NEAR), db as never);
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
      conflict: [existing('A', '07:00', NEARBY)],
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
