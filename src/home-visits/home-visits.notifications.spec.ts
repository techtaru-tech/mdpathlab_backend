import { HomeVisitsService } from './home-visits.service';

// The customer hears about every step of a home visit: booked, assigned (who and when), on the way, arrived,
// cancelled (by them or by us) and missed — in the app/website, and by email for booked, cancelled and missed.
const DATE = new Date('2026-11-05T00:00:00Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'hv1',
    userId: 'u1',
    patientName: 'Asha',
    phone: '9000000001',
    address: '12 Lane',
    city: 'Jaipur',
    pincode: '302020',
    preferredDate: DATE,
    preferredWindow: 'MORNING',
    status: 'ASSIGNED',
    phlebotomistId: 'p1',
    phlebotomist: { id: 'p1', userId: 'pu1', user: { name: 'Ravi', phone: '9000000002' } },
    eta: null,
    labId: null,
    orderId: null,
    order: null,
    user: { name: 'Asha', phone: '9000000001' },
    createdAt: DATE,
    ...over,
  };
}

function setup(current = row()) {
  const prisma = {
    homeCollectionRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(current),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data, id: 'hv1', status: 'REQUESTED' })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })),
    },
    phlebotomist: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', userId: 'pu1', status: 'ACTIVE', labId: null }) },
  };
  const labs = { findMatchingLab: jest.fn().mockResolvedValue({ id: 'lab1' }) };
  const notifications = { notifyUser: jest.fn(), notifyAdmins: jest.fn(), notifyPhlebotomistUser: jest.fn() };
  const mail = { homeVisitUpdate: jest.fn(), homeVisitAssigned: jest.fn(), homeVisitTestsAdded: jest.fn() };
  const service = new HomeVisitsService(prisma as never, labs as never, notifications as never, {} as never, mail as never, { orderSms: jest.fn() } as never, {} as never);
  return { service, prisma, notifications, mail };
}

const tomorrow = () => new Date(Date.now() + 5.5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);

describe('home visit notifications to the customer', () => {
  it('booked: app/website notification and a confirmation email', async () => {
    const { service, notifications, mail } = setup();
    await service.create('u1', { patientName: 'Asha', phone: '9000000001', address: '12 Lane', city: 'Jaipur', pincode: '302020', preferredDate: tomorrow(), preferredWindow: 'MORNING' } as never);
    expect(notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Home visit requested', data: expect.objectContaining({ type: 'HOME_VISIT_STATUS', status: 'REQUESTED' }) }));
    expect(mail.homeVisitUpdate).toHaveBeenCalledWith('u1', 'home-visit-requested', expect.objectContaining({ subject: 'Your home visit is booked' }));
  });

  it("assigned: says who (name and phone) and when", async () => {
    const { service, notifications } = setup(row({ status: 'REQUESTED', phlebotomistId: null, phlebotomist: null }));
    await service.assign('hv1', 'p1');
    const call = notifications.notifyUser.mock.calls.find((c) => c[1].data.status === 'ASSIGNED')!;
    expect(call[1].title).toBe('Phlebotomist assigned');
    expect(call[1].body).toContain('2026-11-05, 7 AM – 11 AM');
  });

  it('on the way and arrived name the phlebotomist', async () => {
    let s = setup();
    await s.service.setStatus('hv1', 'ON_THE_WAY', {});
    expect(s.notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Phlebotomist is on the way', body: expect.stringContaining('Ravi') }));
    s = setup(row({ status: 'ON_THE_WAY' }));
    await s.service.setStatus('hv1', 'ARRIVED', {});
    expect(s.notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Phlebotomist has arrived', body: 'Ravi has reached your address.' }));
  });

  it('cancelled or missed by us: notification and email', async () => {
    let s = setup();
    await s.service.setStatus('hv1', 'CANCELLED', { reason: 'Phlebotomist unavailable' });
    expect(s.notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Home visit cancelled', body: 'Phlebotomist unavailable' }));
    expect(s.mail.homeVisitUpdate).toHaveBeenCalledWith('u1', 'home-visit-cancelled', expect.objectContaining({ lines: expect.arrayContaining(['Reason: Phlebotomist unavailable']) }));
    s = setup(row({ status: 'ARRIVED' }));
    await s.service.setStatus('hv1', 'NO_SHOW', {});
    expect(s.mail.homeVisitUpdate).toHaveBeenCalledWith('u1', 'home-visit-missed', expect.anything());
  });

  it('cancelled by the customer: a confirmation in their notifications', async () => {
    const { service, notifications } = setup(row({ status: 'REQUESTED', phlebotomistId: null, phlebotomist: null }));
    await service.cancelMine('u1', 'hv1');
    expect(notifications.notifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Home visit cancelled', body: expect.stringContaining('2026-11-05') }));
  });
});
