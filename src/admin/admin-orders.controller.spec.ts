import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';

// The admin quick-assign dropdown hits this same endpoint — it must enforce exactly the same
// review/conflict rules as the lab dashboard.
function setup() {
  const order = {
    id: 'o1',
    orderNumber: 'MDP-1',
    userId: 'u1',
    status: 'CONFIRMED',
    collectionType: 'HOME',
    phlebotomistId: null,
    scheduledDate: new Date('2026-10-01T00:00:00.000Z'),
    slot: { startTime: '07:00', endTime: '08:00', label: '07:00-08:00' },
    address: { lat: null, lng: null },
    items: [{ id: 'i1' }],
  };
  const tx = {
    phlebotomist: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE' }) },
    order: { update: jest.fn().mockResolvedValue({ ...order, phlebotomist: { userId: 'pu1' } }) },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const scheduling = { lockPhlebotomist: jest.fn(), checkAvailability: jest.fn() };
  const controller = new AdminOrdersController(prisma as never, { notifyUser: jest.fn() } as never, scheduling as never, { phlebotomistAssignedForOrder: jest.fn(), orderCancelledForOrder: jest.fn() } as never, { orderSms: jest.fn(), phlebotomistSms: jest.fn() } as never, { credit: jest.fn() } as never);
  const req = { admin: { email: 'admin@example.com' } };
  return { controller, tx, scheduling, req };
}

describe('AdminOrdersController.updateStatus — new phlebotomist assignments', () => {
  it('refuses an unverifiable-travel assignment with 409 until confirmed', async () => {
    const { controller, tx, scheduling, req } = setup();
    scheduling.checkAvailability.mockResolvedValue({ available: false, needsReview: true, reason: 'no map location' });

    await expect(controller.updateStatus(req, 'o1', { status: 'PHLEBOTOMIST_ASSIGNED', phlebotomistId: 'p1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.order.update).not.toHaveBeenCalled();

    await controller.updateStatus(req, 'o1', { status: 'PHLEBOTOMIST_ASSIGNED', phlebotomistId: 'p1', confirmUnverifiedTravel: true });
    expect(scheduling.lockPhlebotomist).toHaveBeenCalledWith(tx, 'p1');
    expect(tx.order.update.mock.calls[0][0].data.statusLogs.create.note).toContain('manual travel review');
  });

  it('blocks a real conflict from the quick-assign dropdown, confirmed or not', async () => {
    const { controller, tx, scheduling, req } = setup();
    scheduling.checkAvailability.mockResolvedValue({ available: false, needsReview: false, reason: 'Conflicts with booking MDP-0' });

    await expect(
      controller.updateStatus(req, 'o1', { status: 'PHLEBOTOMIST_ASSIGNED', phlebotomistId: 'p1', confirmUnverifiedTravel: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
