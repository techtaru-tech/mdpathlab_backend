import { Prisma } from '@prisma/client';
import { CommissionSweeper } from './commission.sweeper';

const ACTIVE_SINCE = new Date('2026-10-01T00:00:00Z');
const D = (n: number) => new Prisma.Decimal(n);

function setup(settings: Partial<{ enabled: boolean; activeSince: Date | null; ratePercent: Prisma.Decimal; holdDays: number }> = {}) {
  const db = {
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    commissionRate: { findMany: jest.fn().mockResolvedValue([]) },
    orderItemCommissionRate: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    orderReferralAttribution: { findMany: jest.fn().mockResolvedValue([]) },
    commissionEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(async ({ data }: { data: { availableAt: Date }[]; skipDuplicates?: boolean }) => ({ count: data.length })),
    },
    referralJobHeartbeat: { upsert: jest.fn(), findUnique: jest.fn() },
  };
  const payouts = { settings: jest.fn().mockResolvedValue({ enabled: true, activeSince: ACTIVE_SINCE, ratePercent: D(0), holdDays: 7, ...settings }) };
  return { sweeper: new CommissionSweeper(db as never, payouts as never), db };
}

describe('CommissionSweeper — test-wise rates', () => {
  it("records each booked test's own rate (or the default) at booking time", async () => {
    const { sweeper, db } = setup({ ratePercent: D(2) });
    db.orderItem.findMany.mockResolvedValue([
      { id: 'li1', orderId: 'o1', itemType: 'PARAMETER', itemId: 'cbc' },
      { id: 'li2', orderId: 'o1', itemType: 'PROFILE', itemId: 'heart' },
      { id: 'li3', orderId: 'o1', itemType: 'PARAMETER', itemId: 'tsh' },
    ]);
    db.commissionRate.findMany.mockResolvedValue([
      { itemType: 'PARAMETER', itemId: 'cbc', ratePercent: D(5) },
      { itemType: 'PROFILE', itemId: 'heart', ratePercent: D(15) },
    ]);
    expect((await sweeper.runOnce()).ratesRecorded).toBe(3);
    const call = db.orderItemCommissionRate.createMany.mock.calls[0]![0] as { data: { orderItemId: string; ratePercent: Prisma.Decimal; source: string }[]; skipDuplicates: boolean };
    expect(call.skipDuplicates).toBe(true); // a rate, once recorded, never changes
    expect(call.data.map((d) => [d.orderItemId, Number(d.ratePercent), d.source])).toEqual([
      ['li1', 5, 'ITEM'],
      ['li2', 15, 'ITEM'],
      ['li3', 2, 'DEFAULT'],
    ]);
    expect(db.orderItem.findMany.mock.calls[0][0].where).toMatchObject({ commissionRate: null, order: { createdAt: { gte: ACTIVE_SINCE }, referralAttribution: { isNot: null } } });
  });

  it('earns CBC ₹200 at 5% + Heart ₹600 at 15% = ₹100 on a completed, paid booking, held for the hold period', async () => {
    const { sweeper, db } = setup();
    db.orderReferralAttribution.findMany.mockResolvedValue([
      {
        orderId: 'o1',
        partnerId: 'p1',
        order: {
          discount: 0,
          items: [
            { itemName: 'CBC', itemType: 'PARAMETER', price: 200, commissionRate: { ratePercent: D(5) } },
            { itemName: 'Heart profile', itemType: 'PROFILE', price: 600, commissionRate: { ratePercent: D(15) } },
          ],
        },
      },
    ]);
    expect((await sweeper.runOnce()).earned).toBe(1);
    const where = db.orderReferralAttribution.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ order: { status: 'REPORT_READY', paymentStatus: 'PAID', createdAt: { gte: ACTIVE_SINCE }, commissionEntries: { none: { type: 'EARNING' } } } });
    const call = db.commissionEntry.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[]; skipDuplicates: boolean };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({ orderId: 'o1', type: 'EARNING', amountPaise: 10_000, baseRupees: 800, ratePercent: null });
    expect((call.data[0]!.breakdown as { name: string; amountPaise: number }[]).map((l) => [l.name, l.amountPaise])).toEqual([
      ['CBC', 1000],
      ['Heart profile', 9000],
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

  it('reverses an earned booking that was cancelled or refunded — even while commission is off', async () => {
    const { sweeper, db } = setup({ enabled: false });
    db.commissionEntry.findMany.mockResolvedValue([{ partnerId: 'p1', orderId: 'o9', amountPaise: 15_990 }]);
    expect((await sweeper.runOnce()).reversed).toBe(1);
    expect(db.commissionEntry.findMany.mock.calls[0][0].where.order).toEqual({
      OR: [{ status: 'CANCELLED' }, { paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } }],
      commissionEntries: { none: { type: 'REVERSAL' } },
    });
    expect(db.commissionEntry.createMany.mock.calls[0]![0]).toEqual({
      data: [expect.objectContaining({ orderId: 'o9', type: 'REVERSAL', amountPaise: -15_990 })],
      skipDuplicates: true,
    });
  });
});
