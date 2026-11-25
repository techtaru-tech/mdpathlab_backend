import { AppointmentReminderSweeper } from './appointment-reminder.sweeper.js';

// 25 Nov 2026, 08:00 IST.
const NOW = new Date('2026-11-25T02:30:00.000Z');
const DAY = new Date('2026-11-25T00:00:00.000Z');

function make(orders: { id: string; collectionType: 'HOME' | 'CENTER'; startTime: string }[], hours = 2) {
  const claimed = new Set<string>();
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue(orders.map((o) => ({ id: o.id, collectionType: o.collectionType, scheduledDate: DAY, slot: { startTime: o.startTime } }))),
      updateMany: jest.fn(({ where }: { where: { id: string } }) => {
        if (claimed.has(where.id)) return Promise.resolve({ count: 0 });
        claimed.add(where.id);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const templates = { notifyOrder: jest.fn() };
  const sms = { orderSms: jest.fn() };
  const sweeper = new AppointmentReminderSweeper(prisma as never, { getOrCreate: jest.fn().mockResolvedValue({ reminderHoursBefore: hours }) } as never, templates as never, sms as never);
  return { sweeper, prisma, templates, sms };
}

describe('AppointmentReminderSweeper', () => {
  it('reminds only slots starting within the lead time, once', async () => {
    const { sweeper, templates, sms } = make([
      { id: 'soon', collectionType: 'HOME', startTime: '09:30' }, // 1.5 h away
      { id: 'later', collectionType: 'HOME', startTime: '11:00' }, // 3 h away
      { id: 'centre', collectionType: 'CENTER', startTime: '10:00' }, // 2 h away
    ]);
    expect(await sweeper.runOnce(NOW)).toEqual({ sent: 2 });
    expect(templates.notifyOrder.mock.calls.map((c) => c[1]).sort()).toEqual(['centre', 'soon']);
    // SMS only for home collection.
    expect(sms.orderSms).toHaveBeenCalledTimes(1);
    expect(sms.orderSms).toHaveBeenCalledWith('soon', 'appointmentReminder');

    // A second run finds them already claimed.
    expect(await sweeper.runOnce(NOW)).toEqual({ sent: 0 });
  });

  it('marks a slot that already started without messaging', async () => {
    const { sweeper, templates, prisma } = make([{ id: 'past', collectionType: 'HOME', startTime: '07:00' }]);
    expect(await sweeper.runOnce(NOW)).toEqual({ sent: 0 });
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(templates.notifyOrder).not.toHaveBeenCalled();
  });

  it('sends nothing when reminders are switched off (0 hours)', async () => {
    const { sweeper, prisma } = make([{ id: 'soon', collectionType: 'HOME', startTime: '09:00' }], 0);
    expect(await sweeper.runOnce(NOW)).toEqual({ sent: 0 });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
