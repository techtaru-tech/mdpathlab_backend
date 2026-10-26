import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ReferralSnapshotSweeper } from './referral-snapshot.sweeper';

const T0 = new Date(Date.UTC(2026, 9, 23, 10, 0));
const after = (min: number) => new Date(T0.getTime() + min * 60_000);

function setup() {
  const db = {
    $queryRaw: jest.fn(),
    patientReferral: {
      findUnique: jest.fn().mockResolvedValue({ id: 'r1', events: [{ event: 'BOUND', toPartnerId: 'p1', toStatus: 'ACTIVE', createdAt: T0 }] }),
    },
    referralPartner: {
      findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED', events: [{ toStatus: 'APPROVED', createdAt: after(-60) }, { toStatus: 'SUSPENDED', createdAt: after(5) }] }),
    },
    orderReferralAttribution: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(null) },
    referralSnapshotFailure: { deleteMany: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    referralJobHeartbeat: { upsert: jest.fn(), findUnique: jest.fn() },
  };
  const switches = { referralsEnabled: jest.fn().mockResolvedValue(true) };
  const notifications = { notifyAdmins: jest.fn() };
  return { sweeper: new ReferralSnapshotSweeper(db as never, switches as never, notifications as never), db, notifications };
}

describe('ReferralSnapshotSweeper', () => {
  it('records the partner status in force WHEN the order was placed, idempotently', async () => {
    const { sweeper, db } = setup();
    expect(await sweeper.processOrder({ id: 'o1', userId: 'u1', createdAt: after(10) }, 'SWEEPER')).toBe(true);
    const call = db.orderReferralAttribution.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true); // orderId is unique: a second run / parallel instance cannot duplicate
    expect(call.data[0]).toMatchObject({ orderId: 'o1', partnerId: 'p1', referralStatusAtBooking: 'ACTIVE', partnerStatusAtBooking: 'SUSPENDED', recordedBy: 'SWEEPER' });
    expect(db.referralSnapshotFailure.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'o1' } });
  });

  it('an order placed before the partner was suspended keeps APPROVED', async () => {
    const { sweeper, db } = setup();
    await sweeper.processOrder({ id: 'o2', userId: 'u1', createdAt: after(2) }, 'SWEEPER');
    expect(db.orderReferralAttribution.createMany.mock.calls[0][0].data[0].partnerStatusAtBooking).toBe('APPROVED');
  });

  it('refuses to attribute an order older than the binding', async () => {
    const { sweeper, db } = setup();
    db.referralSnapshotFailure.upsert.mockResolvedValue({ attempts: 1, needsAttention: false });
    expect(await sweeper.processOrder({ id: 'o3', userId: 'u1', createdAt: after(-1) }, 'SWEEPER')).toBe(false);
    expect(db.orderReferralAttribution.createMany).not.toHaveBeenCalled();
  });

  it('a failing order is retried, then flagged for an admin after 5 attempts — once', async () => {
    const { sweeper, db, notifications } = setup();
    db.patientReferral.findUnique.mockRejectedValue(new Error('db hiccup'));
    db.referralSnapshotFailure.upsert.mockResolvedValueOnce({ attempts: 4, needsAttention: false });
    await sweeper.processOrder({ id: 'o4', userId: 'u1', createdAt: after(1) }, 'SWEEPER');
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
    db.referralSnapshotFailure.upsert.mockResolvedValueOnce({ attempts: 5, needsAttention: false });
    await sweeper.processOrder({ id: 'o4', userId: 'u1', createdAt: after(1) }, 'SWEEPER');
    expect(db.referralSnapshotFailure.update).toHaveBeenCalledWith({ where: { orderId: 'o4' }, data: { needsAttention: true } });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    db.referralSnapshotFailure.upsert.mockResolvedValueOnce({ attempts: 6, needsAttention: true });
    await sweeper.processOrder({ id: 'o4', userId: 'u1', createdAt: after(1) }, 'SWEEPER');
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('one bad order does not stop the batch; the heartbeat reports the run', async () => {
    const { sweeper, db } = setup();
    db.$queryRaw.mockResolvedValueOnce([
      { id: 'bad', userId: 'uX', createdAt: after(1) },
      { id: 'good', userId: 'u1', createdAt: after(1) },
    ]);
    db.$queryRaw.mockResolvedValueOnce([{ n: 0n }]);
    db.patientReferral.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === 'uX' ? null : { id: 'r1', events: [{ event: 'BOUND', toPartnerId: 'p1', toStatus: 'ACTIVE', createdAt: T0 }] },
    );
    db.referralSnapshotFailure.upsert.mockResolvedValue({ attempts: 1, needsAttention: false });
    expect(await sweeper.runOnce()).toEqual({ processed: 1, failed: 1 });
    expect(db.referralJobHeartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'snapshot-sweeper' } }));
  });

  it('builds SQL Postgres accepts: int cast for make_interval, UTC comparison', async () => {
    const { sweeper, db } = setup();
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 0n }]);
    await sweeper.runOnce();
    const sql = (db.$queryRaw.mock.calls[1][0] as { strings: string[] }).strings.join('?');
    expect(sql).toMatch(/make_interval\(mins => \?::int\)/);
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'UTC'/);
  });

  it('does not run twice at the same time in one process', async () => {
    const { sweeper, db } = setup();
    let release!: (v: unknown) => void;
    db.$queryRaw.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = sweeper.runOnce();
    expect(await sweeper.runOnce()).toEqual({ processed: 0, failed: 0, skipped: true });
    db.$queryRaw.mockResolvedValueOnce([{ n: 0n }]);
    release([]);
    await first;
  });
});

describe('booking path stays referral-free', () => {
  // The hard guarantee behind "referral tracking can never fail a booking": no booking/payment code imports it.
  it.each(['orders', 'payments', 'cart', 'order-add-ons', 'home-visits', 'auth'])('src/%s does not import the referrals module', (dir) => {
    const root = join(__dirname, '..', dir);
    for (const f of readdirSync(root).filter((n) => n.endsWith('.ts'))) {
      expect(readFileSync(join(root, f), 'utf8')).not.toMatch(/referrals\//);
    }
  });
});
