import { reportFileName, withReports } from './order-reports';
import { OrdersService } from './orders.service';
import { pushData } from '../notifications/notifications.service';

const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
const items = [{ itemName: 'CBC' }, { itemName: 'Lipid Profile' }];

describe('report file names', () => {
  it('order number and tests, safe as a file name', () => {
    expect(reportFileName('MDP-2026-ABC', items)).toBe('MDP-2026-ABC – CBC, Lipid Profile.pdf');
    expect(reportFileName('MDP-1', [{ itemName: 'A' }, { itemName: 'B' }, { itemName: 'C' }, { itemName: 'D' }, { itemName: 'E' }])).toBe('MDP-1 – A, B, C +2 more.pdf');
    expect(reportFileName('MDP-1', [{ itemName: 'T3/T4: Thyroid' }])).toBe('MDP-1 – T3-T4- Thyroid.pdf');
  });
});

describe('orders carry their released reports with name and times', () => {
  it('one report: name, uploadedAt, releasedAt; hasReport / reportCount', () => {
    const o = withReports({ orderNumber: 'MDP-1', items, reports: [{ id: 'r1', fileUrl: '/uploads/reports/x.pdf', status: 'APPROVED', createdAt: at(9), approvedAt: at(10) }] });
    expect(o).toMatchObject({ hasReport: true, reportCount: 1, reports: [{ id: 'r1', name: 'MDP-1 – CBC, Lipid Profile.pdf', uploadedAt: at(9), releasedAt: at(10), fileUrl: '/uploads/reports/x.pdf' }] });
  });

  it('two reports are numbered; none → hasReport false', () => {
    const r = (id: string) => ({ id, fileUrl: null, status: 'APPROVED', createdAt: at(9), approvedAt: at(10) });
    expect(withReports({ orderNumber: 'MDP-1', items, reports: [r('a'), r('b')] }).reports.map((x) => x.name)).toEqual([
      'MDP-1 – CBC, Lipid Profile (1).pdf',
      'MDP-1 – CBC, Lipid Profile (2).pdf',
    ]);
    expect(withReports({ orderNumber: 'MDP-1', items, reports: [] })).toMatchObject({ hasReport: false, reportCount: 0 });
  });
});

describe('GET /reports', () => {
  it("only released reports of this user's bookings, with patient and test names", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Asha' }) },
      report: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            fileUrl: '/uploads/reports/x.pdf',
            createdAt: at(9),
            approvedAt: at(10),
            order: { id: 'o1', orderNumber: 'MDP-1', items: [{ itemName: 'CBC', familyMember: null }, { itemName: 'Lipid Profile', familyMember: { name: 'Ramesh' } }], reports: [{ id: 'r1' }] },
          },
        ]),
      },
    };
    const service = Object.create(OrdersService.prototype) as OrdersService;
    (service as unknown as { prisma: unknown }).prisma = prisma;
    const list = await service.listReports('u1');
    expect(prisma.report.findMany.mock.calls[0][0].where).toEqual({ status: 'APPROVED', order: { userId: 'u1' } });
    expect(list).toEqual([
      { id: 'r1', orderId: 'o1', orderNumber: 'MDP-1', patientName: 'Asha, Ramesh', testNames: ['CBC', 'Lipid Profile'], name: 'MDP-1 – CBC, Lipid Profile.pdf', fileUrl: '/uploads/reports/x.pdf', uploadedAt: at(9), releasedAt: at(10) },
    ]);
  });
});

describe('report-ready push', () => {
  it('keeps type ORDER_STATUS (timeline) and adds event REPORT + reportId', () => {
    expect(pushData({ type: 'ORDER_STATUS', event: 'REPORT', orderId: 'o1', reportId: 'r1', status: 'REPORT_READY' })).toEqual({
      type: 'ORDER_STATUS',
      event: 'REPORT',
      orderId: 'o1',
      reportId: 'r1',
      status: 'REPORT_READY',
      trackingStatus: 'REPORT_READY',
    });
  });
});
