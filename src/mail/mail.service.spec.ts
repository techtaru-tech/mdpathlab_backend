import { MailService } from './mail.service';
import { reportReadyEmail } from './mail-templates';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }) },
}));

const SMTP = { SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'info@example.com', SMTP_PASSWORD: 'pw', APP_PUBLIC_URL: 'https://app.example.com' };

function setup(config: Record<string, string> = SMTP, user: Partial<{ email: string | null; name: string | null; emailNotifications: boolean }> = {}) {
  const logs: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: 'ravi@gmail.com', name: 'Ravi', emailNotifications: true, ...user }),
      update: jest.fn().mockResolvedValue({}),
    },
    emailLog: { create: jest.fn(({ data }: { data: Record<string, unknown> }) => { logs.push(data); return Promise.resolve(data); }) },
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-token'), verifyAsync: jest.fn() };
  const service = new MailService({ get: (k: string, d?: unknown) => config[k] ?? d } as never, prisma as never, jwt as never);
  return { service, prisma, jwt, logs };
}

describe('MailService', () => {
  beforeEach(() => {
    sendMail.mockReset();
    jest.useFakeTimers({ advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('is off until host, user and password are all set', () => {
    expect(setup().service.isConfigured()).toBe(true);
    expect(setup({ ...SMTP, SMTP_PASSWORD: '' }).service.isConfigured()).toBe(false);
  });

  it('logs SKIPPED and sends nothing when SMTP is not configured', async () => {
    const { service, logs } = setup({});
    await service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    expect(sendMail).not.toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ status: 'SKIPPED', template: 'report-ready', toEmail: 'ravi@gmail.com' });
  });

  it('sends the email and logs SENT with the message id', async () => {
    sendMail.mockResolvedValue({ messageId: '<abc@example.com>' });
    const { service, logs } = setup();
    await service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('ravi@gmail.com');
    expect(mail.from).toContain('info@example.com');
    expect(mail.html).toContain('https://app.example.com/booking/o1');
    expect(mail.html).toContain('signed-token'); // unsubscribe link
    expect(logs[0]).toMatchObject({ status: 'SENT', messageId: '<abc@example.com>', orderId: 'o1' });
  });

  it('does not email a user who has no email address', async () => {
    const { service, logs } = setup(SMTP, { email: null });
    await service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    expect(sendMail).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it('respects a user who turned email notifications off (logged as SKIPPED)', async () => {
    const { service, logs } = setup(SMTP, { emailNotifications: false });
    await service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    expect(sendMail).not.toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ status: 'SKIPPED' });
  });

  it('retries, then logs FAILED with the error and never throws', async () => {
    sendMail.mockRejectedValue(new Error('certificate has expired'));
    const { service, logs } = setup();
    const promise = service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(logs[0]).toMatchObject({ status: 'FAILED', error: 'certificate has expired', attempts: 3 });
  });

  it('succeeds on a retry after a transient failure', async () => {
    sendMail.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ messageId: 'm2' });
    const { service, logs } = setup();
    const promise = service.reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1' });
    await jest.runAllTimersAsync();
    await promise;
    expect(logs[0]).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('unsubscribe turns notifications off for a valid token only', async () => {
    const { service, prisma, jwt } = setup();
    jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u1', purpose: 'email-unsubscribe' });
    await expect(service.unsubscribe('good')).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailNotifications: false } });

    jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u1', purpose: 'login' }); // a login token must not work here
    await expect(service.unsubscribe('wrong-purpose')).resolves.toBe(false);
    jwt.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
    await expect(service.unsubscribe('expired')).resolves.toBe(false);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
});

describe('email templates', () => {
  it('escapes user-controlled text so it cannot inject HTML', () => {
    const mail = reportReadyEmail({ name: '<script>alert(1)</script>', appUrl: 'https://a.com', unsubscribeUrl: 'https://a.com/u', orderNumber: 'MDP-<b>1</b>', orderId: 'o1' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('MDP-<b>1</b>');
  });

  it('never attaches or embeds the report itself (privacy) — only a login link', () => {
    const mail = reportReadyEmail({ name: 'Ravi', appUrl: 'https://a.com', unsubscribeUrl: 'https://a.com/u', orderNumber: 'MDP-1', orderId: 'o1' });
    expect(mail.text).toContain('https://a.com/booking/o1');
    expect(mail.html).toContain('not attached');
  });
});
