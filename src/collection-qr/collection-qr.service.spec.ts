import { amountDueAtDoor, CollectionQrService } from './collection-qr.service.js';

const ORDER = { id: 'o1', userId: 'u1', orderNumber: 'MDP-1', status: 'SAMPLE_COLLECTED' };

function make(opts: { qr?: Record<string, unknown> | null; orderOpen?: boolean } = {}) {
  const qr = opts.qr === undefined ? { id: 'q1', orderId: 'o1', phlebotomistId: 'p1', razorpayQrId: 'qr_1', amount: 500, razorpayPaymentId: null, order: ORDER } : opts.qr;
  let claimed = false;
  const tx = {
    collectionUpiQr: {
      updateMany: jest.fn(() => {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      }),
      update: jest.fn(),
    },
    order: { updateMany: jest.fn(() => ({ count: opts.orderOpen === false ? 0 : 1 })) },
    orderStatusLog: { create: jest.fn() },
  };
  const prisma = {
    collectionUpiQr: { findUnique: jest.fn().mockResolvedValue(qr) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const gateway = { audit: jest.fn() };
  const notifications = { notifyUser: jest.fn(), notifyPhlebotomist: jest.fn(), notifyAdmins: jest.fn() };
  const mail = { paymentReceiptForOrder: jest.fn() };
  const service = new CollectionQrService(prisma as never, gateway as never, notifications as never, mail as never);
  return { service, tx, notifications, mail, gateway };
}

describe('CollectionQrService.settle', () => {
  it('marks the booking paid by UPI and tells patient + phlebotomist', async () => {
    const { service, tx, notifications, mail } = make();
    expect(await service.settle('qr_1', 'pay_1', 50000, 'webhook')).toBe(true);
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ collectedAmount: 500, collectionPaymentMode: 'UPI', paymentStatus: 'PAID' }) }),
    );
    expect(tx.collectionUpiQr.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'PAID' } });
    expect(notifications.notifyUser).toHaveBeenCalled();
    expect(notifications.notifyPhlebotomist).toHaveBeenCalled();
    expect(mail.paymentReceiptForOrder).toHaveBeenCalledWith('o1');
  });

  it('a second delivery of the same payment changes nothing', async () => {
    const { service, notifications } = make();
    await service.settle('qr_1', 'pay_1', 50000, 'webhook');
    await service.settle('qr_1', 'pay_1', 50000, 'status-check');
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('a payment after the booking was settled in cash is kept as PAID_LATE and admins are told to refund', async () => {
    const { service, tx, notifications } = make({ orderOpen: false });
    await service.settle('qr_1', 'pay_2', 50000, 'webhook');
    expect(tx.collectionUpiQr.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'PAID_LATE' } });
    expect(notifications.notifyAdmins).toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('a wrong amount does not mark anything paid', async () => {
    const { service, tx } = make();
    await service.settle('qr_1', 'pay_3', 100, 'webhook');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('ignores QRs that are not ours', async () => {
    const { service } = make({ qr: null });
    expect(await service.settle('qr_x', 'pay_4', 50000, 'webhook')).toBe(false);
  });
});

describe('amountDueAtDoor', () => {
  const base = { paymentMethod: 'COD', addOnTotal: 0, total: 900, status: 'SAMPLE_COLLECTED', collectedAmount: null, collectionPaymentMode: null } as never;
  it('pay at collection owes the total; a prepaid booking owes only the door add-ons', () => {
    expect(amountDueAtDoor(base)).toBe(900);
    expect(amountDueAtDoor({ ...(base as object), paymentMethod: 'ONLINE', addOnTotal: 300 } as never)).toBe(300);
  });
  it('refuses before sample collection, after payment, and for prepaid bookings with nothing due', () => {
    expect(() => amountDueAtDoor({ ...(base as object), status: 'PHLEBOTOMIST_ASSIGNED' } as never)).toThrow();
    expect(() => amountDueAtDoor({ ...(base as object), collectedAmount: 900 } as never)).toThrow();
    expect(() => amountDueAtDoor({ ...(base as object), paymentMethod: 'ONLINE' } as never)).toThrow();
  });
});
