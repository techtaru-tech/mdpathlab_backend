import { BadRequestException, ConflictException } from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';

const LAB = 'lab1';

function setup(opts: { currentPhlebotomistId?: string | null; phlebotomist?: { labId: string; status: string } } = {}) {
  const order = {
    id: 'o1',
    orderNumber: 'MDP-1',
    labId: LAB,
    userId: 'u1',
    status: 'CONFIRMED',
    collectionType: 'HOME',
    phlebotomistId: opts.currentPhlebotomistId ?? null,
    scheduledDate: new Date('2026-10-01T00:00:00.000Z'),
    slot: { startTime: '07:00', endTime: '08:00', label: '07:00-08:00' },
    address: { lat: null, lng: null },
    items: [{ id: 'i1' }],
  };
  const tx = {
    phlebotomist: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ...(opts.phlebotomist ?? { labId: LAB, status: 'ACTIVE' }) }) },
    order: { update: jest.fn().mockResolvedValue({ ...order, phlebotomist: { userId: 'pu1' } }) },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const scheduling = { lockPhlebotomist: jest.fn(), checkAvailability: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const service = new LabOrdersService(prisma as never, notifications as never, scheduling as never);
  return { service, tx, scheduling };
}

const REVIEW = { available: false, needsReview: true, reason: 'Travel time to booking MDP-0 can’t be verified' };

describe('LabOrdersService.updateStatus — new phlebotomist assignments', () => {
  it('assigns an available phlebotomist as a PENDING assignment, under the schedule lock', async () => {
    const { service, tx, scheduling } = setup();
    scheduling.checkAvailability.mockResolvedValue({ available: true, needsReview: false });

    await service.updateStatus(LAB, 'o1', 'PHLEBOTOMIST_ASSIGNED', undefined, 'p1');

    expect(scheduling.lockPhlebotomist).toHaveBeenCalledWith(tx, 'p1');
    expect(scheduling.checkAvailability).toHaveBeenCalledWith('p1', expect.objectContaining({ id: 'o1' }), tx);
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ phlebotomistId: 'p1', assignmentStatus: 'PENDING' });
  });

  it('refuses an unverifiable-travel assignment with 409 until it is confirmed', async () => {
    const { service, tx, scheduling } = setup();
    scheduling.checkAvailability.mockResolvedValue(REVIEW);

    await expect(service.updateStatus(LAB, 'o1', 'PHLEBOTOMIST_ASSIGNED', undefined, 'p1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('saves an unverifiable-travel assignment once confirmed, and records that on the status log', async () => {
    const { service, tx, scheduling } = setup();
    scheduling.checkAvailability.mockResolvedValue(REVIEW);

    await service.updateStatus(LAB, 'o1', 'PHLEBOTOMIST_ASSIGNED', 'call patient first', 'p1', true);

    const note = tx.order.update.mock.calls[0][0].data.statusLogs.create.note as string;
    expect(note).toContain('call patient first');
    expect(note).toContain('manual travel review');
  });

  it('never lets confirmation override a real conflict', async () => {
    const { service, tx, scheduling } = setup();
    scheduling.checkAvailability.mockResolvedValue({ available: false, needsReview: false, reason: 'Conflicts with booking MDP-0' });

    await expect(service.updateStatus(LAB, 'o1', 'PHLEBOTOMIST_ASSIGNED', undefined, 'p1', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it.each(['ON_LEAVE', 'INACTIVE'])('refuses a %s phlebotomist', async (status) => {
    const { service, tx, scheduling } = setup({ phlebotomist: { labId: LAB, status } });

    await expect(service.updateStatus(LAB, 'o1', 'PHLEBOTOMIST_ASSIGNED', undefined, 'p1', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(scheduling.checkAvailability).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('does not re-check an existing assignment when the same phlebotomist is re-sent with a status change', async () => {
    const { service, tx, scheduling } = setup({ currentPhlebotomistId: 'p1' });

    await service.updateStatus(LAB, 'o1', 'SAMPLE_COLLECTED', undefined, 'p1');

    expect(scheduling.lockPhlebotomist).not.toHaveBeenCalled();
    expect(scheduling.checkAvailability).not.toHaveBeenCalled();
    expect(tx.order.update.mock.calls[0][0].data).not.toHaveProperty('assignmentStatus');
  });
});
