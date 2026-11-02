import { ReportReleaseService } from './report-release.service';

function setup(orderStatus = 'IN_LAB') {
  const tx = { report: { update: jest.fn().mockResolvedValue({ id: 'r1', status: 'APPROVED' }) }, order: { update: jest.fn() } };
  const prisma = {
    report: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', orderId: 'o1' }) },
    order: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', userId: 'u1', orderNumber: 'MDP-1', status: orderStatus }) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const notifications = { notifyUser: jest.fn() };
  const mail = { reportReady: jest.fn() };
  const sms = { orderSms: jest.fn() };
  return { service: new ReportReleaseService(prisma as never, notifications as never, mail as never, sms as never), tx, notifications, mail, sms };
}

describe('releasing a report to the patient', () => {
  it("a lab's upload: approved, booking REPORT_READY, and the patient is told (app, email, SMS)", async () => {
    const { service, tx, notifications, mail, sms } = setup('IN_LAB');
    await service.release('r1', 'LAB');
    expect(tx.report.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'APPROVED', approvedAt: expect.any(Date) } });
    expect(tx.order.update.mock.calls[0][0].data).toEqual({
      status: 'REPORT_READY',
      statusLogs: { create: { status: 'REPORT_READY', note: 'Report uploaded by the lab and released', changedBy: 'LAB' } },
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Your report is ready', data: { type: 'ORDER_STATUS', event: 'REPORT', orderId: 'o1', reportId: 'r1', status: 'REPORT_READY' } }));
    expect(mail.reportReady).toHaveBeenCalledWith('u1', { orderNumber: 'MDP-1', orderId: 'o1', reportId: 'r1' });
    expect(sms.orderSms).toHaveBeenCalledWith('o1', 'reportReady');
  });

  it('a corrected report on a booking that already had one is announced as updated', async () => {
    const { service, tx, notifications } = setup('REPORT_READY');
    await service.release('r1', 'LAB');
    expect(tx.order.update.mock.calls[0][0].data.statusLogs.create.note).toBe('Updated report released');
    expect(notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Your updated report is ready' }));
  });

  it('never on a cancelled booking', async () => {
    const { service, tx, notifications } = setup('CANCELLED');
    await expect(service.release('r1', 'ADMIN')).rejects.toMatchObject({ status: 400 });
    expect(tx.report.update).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });
});
