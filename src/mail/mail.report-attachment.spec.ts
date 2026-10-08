import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { MailService } from './mail.service';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }) },
}));

const SMTP = { SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'info@example.com', SMTP_PASSWORD: 'pw', APP_PUBLIC_URL: 'https://app.example.com' };
const DIR = join(process.cwd(), 'uploads', 'reports');
const FILE = '__attachment-test.pdf';

function makePdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Lab report');
    doc.end();
  });
}

function setup(over: { phone?: string; fileUrl?: string | null; reportOwner?: string } = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(({ select }: { select: Record<string, boolean> }) =>
        Promise.resolve(select.email ? { email: 'ravi@gmail.com', name: 'Ravi', emailNotifications: true } : { phone: over.phone ?? '9876543210' }),
      ),
    },
    report: {
      findUnique: jest.fn().mockResolvedValue({ fileUrl: over.fileUrl === undefined ? `/uploads/reports/${FILE}` : over.fileUrl, order: { userId: over.reportOwner ?? 'u1' } }),
    },
    emailLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-token'), verifyAsync: jest.fn() };
  return new MailService({ get: (k: string, d?: unknown) => (SMTP as Record<string, string>)[k] ?? d } as never, prisma as never, jwt as never);
}

describe('report email attachment', () => {
  beforeAll(async () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, FILE), await makePdf());
  });
  afterAll(() => rmSync(join(DIR, FILE), { force: true }));
  beforeEach(() => sendMail.mockReset().mockResolvedValue({ messageId: '<x>' }));

  it('attaches the report PDF, locked, and never prints the password', async () => {
    await setup().reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1', reportId: 'r1' });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.attachments).toHaveLength(1);
    const { filename, content } = mail.attachments[0] as { filename: string; content: Buffer };
    expect(filename).toBe('MDPathLabs-Report-MDP-1.pdf');
    expect(content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(content.toString('latin1')).toContain('/Encrypt');
    expect(mail.html).toContain('password-protected');
    expect(mail.html).not.toContain('3210');
    expect(mail.text).not.toContain('3210');
  });

  it('falls back to the link-only email when the file is missing, foreign, or the phone is unusable', async () => {
    for (const over of [{ fileUrl: '/uploads/reports/nope.pdf' }, { fileUrl: null }, { reportOwner: 'someone-else' }, { phone: '12' }, { fileUrl: '/../../.env' }]) {
      sendMail.mockClear();
      await setup(over).reportReady('u1', { orderNumber: 'MDP-1', orderId: 'o1', reportId: 'r1' });
      const mail = sendMail.mock.calls[0][0];
      expect(mail.attachments).toBeUndefined();
      expect(mail.html).toContain('not attached');
    }
  });
});
