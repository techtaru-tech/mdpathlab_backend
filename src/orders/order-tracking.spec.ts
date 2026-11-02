import { trackingStatusOf, withTracking } from './order-tracking';
import { pushData } from '../notifications/notifications.service';

describe('booking push data carries the timeline step', () => {
  it.each([
    ['PHLEBOTOMIST_ASSIGNED', 'ASSIGNED'],
    ['ON_THE_WAY', 'ON_THE_WAY'],
    ['REACHED', 'ON_THE_WAY'],
    ['SAMPLE_COLLECTED', 'SAMPLE_COLLECTED'],
    ['IN_LAB', 'IN_LAB'],
    ['REPORT_READY', 'REPORT_READY'],
    ['CANCELLED', 'CANCELLED'],
  ])('%s → trackingStatus %s, with type and orderId kept', (status, step) => {
    expect(pushData({ type: 'ORDER_STATUS', orderId: 'o1', status })).toEqual({ type: 'ORDER_STATUS', orderId: 'o1', status, trackingStatus: step });
  });

  it('other pushes are unchanged', () => {
    expect(pushData({ type: 'ASSIGNMENT', orderId: 'o1' })).toEqual({ type: 'ASSIGNMENT', orderId: 'o1' });
  });
});

const t = (min: number) => new Date(Date.UTC(2026, 10, 2, 4, min));

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    status: 'CONFIRMED' as const,
    phlebotomistId: null as string | null,
    onTheWayAt: null as Date | null,
    reachedAt: null as Date | null,
    handedOverAt: null as Date | null,
    sampleReceivedAt: null as Date | null,
    statusLogs: [{ status: 'CONFIRMED' as const, createdAt: t(0) }],
    phlebotomist: null as { experienceYears: number | null; user: { name: string | null; phone: string } } | null,
    ...over,
  } as Parameters<typeof withTracking>[0];
}

describe('customer booking timeline', () => {
  it('walks the steps: confirmed → assigned → on the way → collected → processing → report ready', () => {
    expect(trackingStatusOf(order())).toBe('CONFIRMED');
    expect(trackingStatusOf(order({ status: 'PHLEBOTOMIST_ASSIGNED', phlebotomistId: 'p1' }))).toBe('ASSIGNED');
    expect(trackingStatusOf(order({ status: 'PHLEBOTOMIST_ASSIGNED', phlebotomistId: 'p1', onTheWayAt: t(5) }))).toBe('ON_THE_WAY');
    expect(trackingStatusOf(order({ status: 'SAMPLE_COLLECTED', onTheWayAt: t(5) }))).toBe('SAMPLE_COLLECTED');
    expect(trackingStatusOf(order({ status: 'IN_LAB' }))).toBe('IN_LAB');
    expect(trackingStatusOf(order({ status: 'REPORT_READY' }))).toBe('REPORT_READY');
    expect(trackingStatusOf(order({ status: 'CANCELLED', onTheWayAt: t(5) }))).toBe('CANCELLED');
    expect(trackingStatusOf(order({ status: 'PENDING_PAYMENT' }))).toBe('PENDING_PAYMENT');
  });

  it('gives every step its time, the phlebotomist flat, and keeps the original fields', () => {
    const o = withTracking(
      order({
        status: 'REPORT_READY',
        phlebotomistId: 'p1',
        onTheWayAt: t(10),
        reachedAt: t(20),
        handedOverAt: t(40),
        sampleReceivedAt: t(50),
        phlebotomist: { experienceYears: 4, user: { name: 'Ravi', phone: '9000000001' } },
        statusLogs: [
          { status: 'CONFIRMED', createdAt: t(0) },
          { status: 'PHLEBOTOMIST_ASSIGNED', createdAt: t(2) },
          { status: 'PHLEBOTOMIST_ASSIGNED', createdAt: t(4) }, // reassigned
          { status: 'SAMPLE_COLLECTED', createdAt: t(30) },
          { status: 'IN_LAB', createdAt: t(50) },
          { status: 'REPORT_READY', createdAt: t(90) },
        ],
      }),
    );
    expect(o).toMatchObject({
      status: 'REPORT_READY',
      trackingStatus: 'REPORT_READY',
      trackingStatusLabel: 'Report ready',
      phlebotomistStatus: 'Handed Over',
      assignedAt: t(4),
      onTheWayAt: t(10),
      reachedAt: t(20),
      sampleCollectedAt: t(30),
      handedOverAt: t(40),
      inLabAt: t(50),
      reportReadyAt: t(90),
      cancelledAt: null,
      phlebotomist: { name: 'Ravi', phone: '9000000001', experienceYears: 4, user: { name: 'Ravi', phone: '9000000001' } },
    });
  });

  it('nothing assigned yet: no phlebotomist and no times beyond what happened', () => {
    const o = withTracking(order());
    expect(o).toMatchObject({ phlebotomist: null, assignedAt: null, sampleCollectedAt: null, inLabAt: null, reportReadyAt: null, cancelledAt: null, trackingStatusLabel: 'Booking confirmed' });
  });

  it('cancelled: cancelledAt is the cancellation time; experience missing is null', () => {
    const o = withTracking(
      order({
        status: 'CANCELLED',
        phlebotomistId: 'p1',
        phlebotomist: { experienceYears: null, user: { name: null, phone: '9000000002' } },
        statusLogs: [
          { status: 'CONFIRMED', createdAt: t(0) },
          { status: 'CANCELLED', createdAt: t(7) },
        ],
      }),
    );
    expect(o).toMatchObject({ cancelledAt: t(7), phlebotomistStatus: 'Cancelled', phlebotomist: { experienceYears: null, name: null } });
  });
});
