import { Prisma } from '@prisma/client';
import { CommissionSweeper } from './commission.sweeper';

const ACTIVE_SINCE = new Date('2026-10-01T00:00:00Z');
const BOOKED_AT = new Date('2026-11-10T06:00:00Z');
const D = (n: number) => new Prisma.Decimal(n);

function setup(settings: Partial<{ enabled: boolean; activeSince: Date | null; ratePercent: Prisma.Decimal; holdDays: number }> = {}) {
  const db = {
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    commissionRate: { findMany: jest.fn().mockResolvedValue([]) },
    commissionItemCategory: { findMany: jest.fn().mockResolvedValue([]) },
    partnerCommissionMou: { findMany: jest.fn().mockResolvedValue([]) },
    orderItemCommissionRate: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    orderReferralAttribution: { findMany: jest.fn().mockResolvedValue([]) },
    commissionEntry: {
      createMany: jest.fn(async ({ data }: { data: { availableAt: Date }[]; skipDuplicates?: boolean }) => ({ count: data.length })),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    referralJobHeartbeat: { upsert: jest.fn(), findUnique: jest.fn() },
  };
  const payouts = { settings: jest.fn().mockResolvedValue({ enabled: true, activeSince: ACTIVE_SINCE, ratePercent: D(0), holdDays: 7, ...settings }) };
  return { sweeper: new CommissionSweeper(db as never, payouts as never), db };
}

const line = (id: string, itemType: string, itemId: string, partnerId: string | null = 'p1', createdAt = BOOKED_AT) => ({
  id,
  orderId: 'o1',
  itemType,
  itemId,
  order: { createdAt, referralAttribution: partnerId ? { partnerId } : null },
});

type RateRow = { orderItemId: string; ratePercent: Prisma.Decimal; source: string; category: string; mouId: string | null };
const recorded = (db: ReturnType<typeof setup>["db"]) => (db.orderItemCommissionRate.createMany.mock.calls[0]![0] as unknown as { data: RateRow[] }).data;

describe('CommissionSweeper — rates at booking time', () => {
  it("without an MOU: each test's own rate, or the default", async () => {
    const { sweeper, db } = setup({ ratePercent: D(2) });
    db.orderItem.findMany.mockResolvedValue([line('li1', 'PARAMETER', 'cbc'), line('li2', 'PROFILE', 'heart'), line('li3', 'PARAMETER', 'tsh')]);
    db.commissionRate.findMany.mockResolvedValue([
      { itemType: 'PARAMETER', itemId: 'cbc', ratePercent: D(5) },
      { itemType: 'PROFILE', itemId: 'heart', ratePercent: D(15) },
    ]);
    expect((await sweeper.runOnce()).ratesRecorded).toBe(3);
    expect((db.orderItemCommissionRate.createMany.mock.calls[0]![0] as unknown as { skipDuplicates: boolean }).skipDuplicates).toBe(true);
    expect(recorded(db).map((d) => [d.orderItemId, Number(d.ratePercent), d.source])).toEqual([
      ['li1', 5, 'ITEM'],
      ['li2', 15, 'ITEM'],
      ['li3', 2, 'DEFAULT'],
    ]);
    expect(db.orderItem.findMany.mock.calls[0][0].where).toMatchObject({ commissionRate: null, order: { createdAt: { gte: ACTIVE_SINCE }, referralAttribution: { isNot: null } } });
  });

  it("with an MOU: the partner's Routine / Special / Package rate, by the test's category", async () => {
    const { sweeper, db } = setup({ ratePercent: D(2) });
    db.orderItem.findMany.mockResolvedValue([line('li1', 'PARAMETER', 'cbc'), line('li2', 'PROFILE', 'vitd'), line('li3', 'PACKAGE', 'fullbody')]);
    db.commissionRate.findMany.mockResolvedValue([{ itemType: 'PARAMETER', itemId: 'cbc', ratePercent: D(5) }]); // ignored: the MOU wins
    db.commissionItemCategory.findMany.mockResolvedValue([{ itemType: 'PROFILE', itemId: 'vitd', category: 'SPECIAL' }]);
    db.partnerCommissionMou.findMany.mockResolvedValue([
      { id: 'mou-old', partnerId: 'p1', routinePercent: D(10), specialPercent: D(10), packagePercent: D(10), effectiveFrom: new Date('2026-10-01'), withdrawnAt: null },
      { id: 'mou-now', partnerId: 'p1', routinePercent: D(20), specialPercent: D(15), packagePercent: D(10), effectiveFrom: new Date('2026-11-01'), withdrawnAt: null },
      // Starts after the booking was made — must not apply to it.
      { id: 'mou-later', partnerId: 'p1', routinePercent: D(30), specialPercent: D(30), packagePercent: D(30), effectiveFrom: new Date('2026-12-01'), withdrawnAt: null },
    ]);
    await sweeper.runOnce();
    expect(recorded(db).map((d) => [d.orderItemId, d.category, Number(d.ratePercent), d.source, d.mouId])).toEqual([
      ['li1', 'ROUTINE', 20, 'MOU', 'mou-now'],
      ['li2', 'SPECIAL', 15, 'MOU', 'mou-now'],
      ['li3', 'PACKAGE', 10, 'MOU', 'mou-now'],
    ]);
  });

  it("a different partner's MOU never applies", async () => {
    const { sweeper, db } = setup({ ratePercent: D(2) });
    db.orderItem.findMany.mockResolvedValue([line('li1', 'PARAMETER', 'cbc', 'p2')]);
    db.partnerCommissionMou.findMany.mockResolvedValue([
      { id: 'mou-p1', partnerId: 'p1', routinePercent: D(20), specialPercent: D(15), packagePercent: D(10), effectiveFrom: new Date('2026-11-01'), withdrawnAt: null },
    ]);
    await sweeper.runOnce();
    expect(recorded(db).map((d) => [d.source, Number(d.ratePercent)])).toEqual([['DEFAULT', 2]]);
  });
});

describe('CommissionSweeper — earnings', () => {
  it('earns CBC ₹200 at 5% + Heart ₹600 at 15% = ₹100 on a completed, paid booking, held for the hold period', async () => {
    const { sweeper, db } = setup();
    db.orderReferralAttribution.findMany.mockResolvedValue([
      {
        orderId: 'o1',
        partnerId: 'p1',
        order: {
          discount: 0,
          items: [
            { itemName: 'CBC', itemType: 'PARAMETER', price: 200, commissionRate: { ratePercent: D(5), category: 'ROUTINE' } },
            { itemName: 'Heart profile', itemType: 'PROFILE', price: 600, commissionRate: { ratePercent: D(15), category: 'SPECIAL' } },
          ],
        },
      },
    ]);
    expect((await sweeper.runOnce()).earned).toBe(1);
    const where = db.orderReferralAttribution.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ order: { status: 'REPORT_READY', paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, createdAt: { gte: ACTIVE_SINCE }, commissionEntries: { none: { type: 'EARNING' } } } });
    const call = db.commissionEntry.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[]; skipDuplicates: boolean };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({ orderId: 'o1', type: 'EARNING', amountPaise: 10_000, baseRupees: 800, ratePercent: null });
    expect((call.data[0]!.breakdown as { name: string; category: string; amountPaise: number }[]).map((l) => [l.name, l.category, l.amountPaise])).toEqual([
      ['CBC', 'ROUTINE', 1000],
      ['Heart profile', 'SPECIAL', 9000],
    ]);
    expect((call.data[0]!.availableAt as Date).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600_000);
  });

  it('waits while any line of the booking still has no recorded rate', async () => {
    const { sweeper, db } = setup();
    db.orderReferralAttribution.findMany.mockResolvedValue([
      { orderId: 'o1', partnerId: 'p1', order: { discount: 0, items: [{ itemName: 'CBC', itemType: 'PARAMETER', price: 200, commissionRate: null }] } },
    ]);
    expect((await sweeper.runOnce()).earned).toBe(0);
    expect(db.commissionEntry.createMany).not.toHaveBeenCalled();
  });

  it.each([[{ enabled: false }], [{ activeSince: null }]])('records no rates and earns nothing while %j', async (settings) => {
    const { sweeper, db } = setup(settings);
    await sweeper.runOnce();
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
    expect(db.orderReferralAttribution.findMany).not.toHaveBeenCalled();
  });
});

describe('CommissionSweeper — cancellations and refunds', () => {
  const earning = { orderId: 'o9', partnerId: 'p1', earned: 30_000, base: 2000, breakdown: [{ name: 'Special test', itemType: 'PROFILE', category: 'SPECIAL', amountPaise: 30_000 }] };

  it('cancelled: reverses the whole earning — even while commission is off', async () => {
    const { sweeper, db } = setup({ enabled: false });
    db.$queryRaw.mockResolvedValue([{ ...earning, fully: true, refunded: 0, reversed: 0 }]);
    expect((await sweeper.runOnce()).reversed).toBe(1);
    expect(db.commissionEntry.createMany.mock.calls[0]![0]).toEqual({
      data: [expect.objectContaining({ orderId: 'o9', type: 'REVERSAL', amountPaise: -30_000, seq: 30_000 })],
      skipDuplicates: true,
    });
  });

  it('partial refund ₹500 of ₹2,000 at 15%: ₹300 → ₹225, so ₹75 is reversed', async () => {
    const { sweeper, db } = setup();
    db.$queryRaw.mockResolvedValue([{ ...earning, fully: false, refunded: 50_000, reversed: 0 }]);
    await sweeper.runOnce();
    const row = (db.commissionEntry.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data[0]!;
    expect(row).toMatchObject({ type: 'REVERSAL', amountPaise: -7_500, seq: 7_500 });
    expect(row.breakdown).toEqual([{ name: 'Special test', itemType: 'PROFILE', category: 'SPECIAL', amountPaise: -7_500 }]);
  });

  it('a later full refund reverses only what is left', async () => {
    const { sweeper, db } = setup();
    db.$queryRaw.mockResolvedValue([{ ...earning, fully: true, refunded: 200_000, reversed: 7_500 }]);
    await sweeper.runOnce();
    expect((db.commissionEntry.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data[0]).toMatchObject({ amountPaise: -22_500, seq: 30_000 });
  });

  it('writes nothing when the reversal is already up to date', async () => {
    const { sweeper, db } = setup();
    db.$queryRaw.mockResolvedValue([{ ...earning, fully: false, refunded: 50_000, reversed: 7_500 }]);
    expect((await sweeper.runOnce()).reversed).toBe(0);
    expect(db.commissionEntry.createMany).not.toHaveBeenCalled();
  });
});
