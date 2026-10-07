import { MailService } from './mail.service';
import { orderCancelledEmail, paymentReceiptEmail, welcomeEmail } from './mail-templates';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }) },
}));

const SMTP = { SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'noreply@example.com', SMTP_PASSWORD: 'pw', APP_PUBLIC_URL: 'https://app.example.com' };

const baseOrder = {
  id: 'o1',
  userId: 'u1',
  orderNumber: 'MDP-1',
  paymentStatus: 'PAID',
  paymentMethod: 'ONLINE',
  razorpayPaymentId: 'pay_ABC123',
  collectionPaymentMode: null,
  collectedAmount: null,
  collectedAt: null,
  updatedAt: new Date('2026-10-07T10:00:00Z'),
  subtotal: 1000,
  discount: 100,
  collectionFee: 0,
  walletAmountUsed: 0,
  total: 900,
  items: [{ itemName: 'CBC Test', price: 400 }, { itemName: 'Lipid Profile', price: 600 }],
};

function setup(opts: { order?: Record<string, unknown>; alreadySent?: boolean; bonus?: number } = {}) {
  const logs: Array<Record<string, unknown>> = [];
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'ravi@gmail.com', name: 'Ravi', emailNotifications: true }) },
    order: { findUnique: jest.fn().mockResolvedValue({ ...baseOrder, ...opts.order }) },
    emailLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => { logs.push(data); return Promise.resolve(data); }),
      findFirst: jest.fn().mockResolvedValue(opts.alreadySent ? { id: 'x' } : null),
    },
    siteSetting: { findFirst: jest.fn().mockResolvedValue({ address: 'Jaipur', phone: '9999999999' }) },
    walletTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.bonus ?? 0 } }) },
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
  const service = new MailService({ get: (k: string, d?: unknown) => (SMTP as Record<string, string>)[k] ?? d } as never, prisma as never, jwt as never);
  return { service, prisma, logs };
}

describe('MailService events', () => {
  beforeEach(() => sendMail.mockReset().mockResolvedValue({ messageId: '<m@example.com>' }));

  it('receipt/invoice lists every item and the amount actually paid', async () => {
    const { service, logs } = setup();
    await service.paymentReceiptForOrder('o1');
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Payment receipt');
    for (const text of ['INV-MDP-1', 'CBC Test', 'Lipid Profile', 'pay_ABC123', 'Online payment (Razorpay)']) expect(mail.html).toContain(text);
    expect(mail.text).toContain('Amount paid: ₹900');
    expect(logs[0]).toMatchObject({ status: 'SENT', template: 'payment-receipt', orderId: 'o1' });
  });

  it('never sends a receipt for an unpaid order, and never twice for the same order', async () => {
    await setup({ order: { paymentStatus: 'PENDING' } }).service.paymentReceiptForOrder('o1');
    expect(sendMail).not.toHaveBeenCalled();
    await setup({ alreadySent: true }).service.paymentReceiptForOrder('o1');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('cash collected at the door is shown as pay-on-collection, using the amount collected', async () => {
    const { service } = setup({ order: { razorpayPaymentId: null, paymentMethod: 'COD', collectionPaymentMode: 'CASH', collectedAmount: 900, collectedAt: new Date('2026-10-08T05:00:00Z') } });
    await service.paymentReceiptForOrder('o1');
    expect(sendMail.mock.calls[0][0].html).toContain('Pay on collection (cash)');
  });

  it('a wallet-only booking is a receipt for the wallet amount, not ₹0', async () => {
    const { service } = setup({ order: { razorpayPaymentId: null, total: 0, walletAmountUsed: 900 } });
    await service.paymentReceiptForOrder('o1');
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('MD Path Labs wallet');
    expect(mail.text).toContain('Amount paid: ₹900');
    expect(mail.text).not.toContain('Paid from wallet');
  });

  it('cancellation only promises a wallet refund when money was really returned', async () => {
    await setup().service.orderCancelledForOrder('o1', { reason: 'Changed my mind', walletRefunded: 250 });
    expect(sendMail.mock.calls[0][0].html).toContain('₹250');
    expect(sendMail.mock.calls[0][0].html).toContain('returned to your MD Path Labs wallet');

    sendMail.mockClear();
    await setup().service.orderCancelledForOrder('o1', { reason: 'Slot unavailable' }); // admin cancel: no wallet credit
    const html = sendMail.mock.calls[0][0].html as string;
    expect(html).not.toContain('returned to your');
    expect(html).toContain('our team will get in touch');
  });

  it('welcome is sent once and mentions the bonus only if one was credited', async () => {
    await setup({ bonus: 250 }).service.welcome('u1');
    expect(sendMail.mock.calls[0][0].html).toContain('₹250 welcome bonus');

    sendMail.mockClear();
    await setup().service.welcome('u1');
    expect(sendMail.mock.calls[0][0].html).not.toContain('welcome bonus');

    sendMail.mockClear();
    await setup({ alreadySent: true }).service.welcome('u1');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('puts the lab contact line in the footer', async () => {
    await setup().service.welcome('u1');
    expect(sendMail.mock.calls[0][0].html).toContain('MD Path Labs · Jaipur · 9999999999');
  });
});

describe('new email templates', () => {
  const ctx = { name: '<b>Ravi</b>', appUrl: 'https://a.com', unsubscribeUrl: 'https://a.com/u' };

  it('escape customer-controlled text', () => {
    const w = welcomeEmail(ctx);
    expect(w.html).not.toContain('<b>Ravi</b>');
    const c = orderCancelledEmail({ ...ctx, orderNumber: 'MDP-1', orderId: 'o1', reason: '<script>x</script>', walletRefunded: 0, wasPaid: false });
    expect(c.html).not.toContain('<script>');
    const r = paymentReceiptEmail({ ...ctx, orderNumber: 'MDP-1', orderId: 'o1', paidOn: '7 Oct 2026', lines: [{ name: '<img src=x>', price: 100 }], subtotal: 100, discount: 0, collectionFee: 0, walletUsed: 0, total: 100, method: 'Online' });
    expect(r.html).not.toContain('<img src=x>');
  });

  it('every email carries an unsubscribe link', () => {
    expect(welcomeEmail(ctx).html).toContain('https://a.com/u');
    expect(welcomeEmail(ctx).text).toContain('https://a.com/u');
  });
});
