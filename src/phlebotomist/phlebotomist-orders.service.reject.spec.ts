import { BadRequestException } from '@nestjs/common';
import { PhlebotomistOrdersService } from './phlebotomist-orders.service';

function setup(order: Record<string, unknown>) {
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', phlebotomistId: 'p1', collectionType: 'HOME', ...order }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new PhlebotomistOrdersService(prisma as never, { notifyUser: jest.fn() } as never, { paymentReceiptForOrder: jest.fn() } as never);
  return { service, prisma };
}

describe('PhlebotomistOrdersService.rejectAssignment — new assignments', () => {
  it('unassigns the phlebotomist and returns the booking to assignment-pending (CONFIRMED) with a log entry', async () => {
    const { service, prisma } = setup({ status: 'PHLEBOTOMIST_ASSIGNED', assignmentStatus: 'PENDING' });

    await service.rejectAssignment('p1', 'o1', 'vehicle breakdown', '9000000000');

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      phlebotomistId: null,
      assignmentStatus: null,
      assignmentRejectedReason: 'vehicle breakdown',
      status: 'CONFIRMED',
    });
    expect(data.statusLogs.create).toMatchObject({ status: 'CONFIRMED', changedBy: 'PHLEBOTOMIST:9000000000' });
    expect(data.statusLogs.create.note).toContain('assignment pending');
    expect(data.statusLogs.create.note).toContain('vehicle breakdown');
  });

  it('touches nothing but the assignment fields (patient, address, items, slot are left alone)', async () => {
    const { service, prisma } = setup({ status: 'PHLEBOTOMIST_ASSIGNED', assignmentStatus: 'PENDING' });

    await service.rejectAssignment('p1', 'o1', undefined, '9000000000');

    const keys = Object.keys(prisma.order.update.mock.calls[0][0].data).sort();
    expect(keys).toEqual(['assignmentRejectedReason', 'assignmentStatus', 'phlebotomistId', 'status', 'statusLogs']);
  });

  it('does not change the status if the booking was never moved to PHLEBOTOMIST_ASSIGNED', async () => {
    const { service, prisma } = setup({ status: 'CONFIRMED', assignmentStatus: 'PENDING' });

    await service.rejectAssignment('p1', 'o1', undefined, '9000000000');

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('statusLogs');
    expect(data.phlebotomistId).toBeNull();
  });

  it('cannot reject an assignment that was already accepted', async () => {
    const { service, prisma } = setup({ status: 'PHLEBOTOMIST_ASSIGNED', assignmentStatus: 'ACCEPTED' });

    await expect(service.rejectAssignment('p1', 'o1', undefined, '9000000000')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
