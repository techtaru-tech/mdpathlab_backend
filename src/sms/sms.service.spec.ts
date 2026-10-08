import { SmsSendError, SmsService } from './sms.service';

const CONFIG = {
  SMS_API_BASE_URL: 'https://smsweb.kanpurcityonline.com/',
  SMS_API_USERNAME: 'mdpath.trans',
  SMS_API_PASSWORD: 's3cret&pass',
  SMS_SENDER_ID: 'MDLAB',
  SMS_OTP_DLT_CONTENT_ID: '1707178038322244162',
};

function makeService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = { ...CONFIG, ...overrides };
  return new SmsService({ get: (k: string) => values[k] } as never, {} as never);
}

function mockProvider(body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({ json: () => Promise.resolve(body) });
  global.fetch = fetchMock as never;
  return fetchMock;
}

describe('SmsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is off until username, password, base URL and sender are all set', () => {
    expect(makeService().isConfigured()).toBe(true);
    expect(makeService({ SMS_API_USERNAME: '' }).isConfigured()).toBe(false);
    expect(makeService({ SMS_API_PASSWORD: undefined }).isConfigured()).toBe(false);
  });

  it('sends the exact DLT OTP text with the right parameters', async () => {
    const fetchMock = mockProvider({ transactionId: 1, state: 'SUBMIT_ACCEPTED', statusCode: 200 });
    await makeService().sendOtp('9876543210', '482913');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe('https://smsweb.kanpurcityonline.com/fe/api/v1/send');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      username: 'mdpath.trans',
      password: 's3cret&pass', // special characters survive URL-encoding
      unicode: 'false',
      from: 'MDLAB',
      to: '919876543210', // India country code added to a 10-digit number
      text: 'MD PATH LAB - Your login OTP is 482913\nLogin for your Good Health.',
      dltContentId: '1707178038322244162',
    });
  });

  it.each([
    [2070, 'SMS panel authentication failed (username/password)'],
    [6001, 'SMS balance exhausted'],
    [2051, 'Sender ID is not registered on the SMS panel'],
  ])('treats provider status %i as a failure even though HTTP is 200', async (statusCode, reason) => {
    mockProvider({ transactionId: 0, state: 'SUBMIT_FAILED', statusCode, description: 'x' });
    await expect(makeService().sendOtp('9876543210', '1')).rejects.toMatchObject({ message: reason, providerStatusCode: statusCode });
  });

  it('reports an unreachable gateway without leaking the password in the error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as never;
    const err = await makeService().sendOtp('9876543210', '1').catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(err.message).toBe('SMS gateway unreachable');
    expect(err.message).not.toContain('s3cret');
  });

  it('refuses to send without a DLT Content Id', async () => {
    const fetchMock = mockProvider({});
    await expect(makeService({ SMS_OTP_DLT_CONTENT_ID: '' }).sendOtp('9876543210', '1')).rejects.toBeInstanceOf(SmsSendError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  describe("booking confirmed SMS", () => {
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue({ orderNumber: "MD10234", user: { phone: "9876543210" } }) } };
    const make = (o: Record<string, string | undefined> = {}) => {
      const values: Record<string, string | undefined> = { ...CONFIG, SMS_BOOKING_DLT_CONTENT_ID: "1707178038342504631", ...o };
      return new SmsService({ get: (k: string) => values[k] } as never, prisma as never);
    };

    it("sends the registered text with the order number", async () => {
      const fetchMock = mockProvider({ statusCode: 200, state: "SUBMIT_ACCEPTED" });
      await make().bookingConfirmedForOrder("o1");
      const p = Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams);
      expect(p.text).toBe("MD PATH LAB - Your test is booked with ID no. MD10234 Our team will contact you soon for sample collection.");
      expect(p.dltContentId).toBe("1707178038342504631");
      expect(p.to).toBe("919876543210");
    });

    it("does nothing until the booking template id is set, and never throws", async () => {
      const fetchMock = mockProvider({});
      await make({ SMS_BOOKING_DLT_CONTENT_ID: "" }).bookingConfirmedForOrder("o1");
      expect(fetchMock).not.toHaveBeenCalled();
      mockProvider({ statusCode: 6001 });
      await expect(make().bookingConfirmedForOrder("o1")).resolves.toBeUndefined();
    });
  });
  describe("order SMS templates", () => {
    const ids = {
      SMS_SAMPLE_OTP_DLT_CONTENT_ID: "1777179145424890283",
      SMS_PHLEBO_ASSIGNED_DLT_CONTENT_ID: "1777179145437107196",
      SMS_ON_THE_WAY_DLT_CONTENT_ID: "1777179145443648090",
      SMS_REPORT_READY_DLT_CONTENT_ID: "1777179145450602392",
      SMS_CANCELLED_DLT_CONTENT_ID: "1777179145457742135",
    };
    const make = (o: Record<string, string | undefined> = {}, support: string | null = "9876500000") => {
      const prisma = {
        order: { findUnique: jest.fn().mockResolvedValue({ orderNumber: "MD10234", user: { phone: "9876543210" }, phlebotomist: { user: { name: "Rahul" } } }) },
        siteSetting: { findFirst: jest.fn().mockResolvedValue({ phone: support }) },
      };
      const values: Record<string, string | undefined> = { ...CONFIG, ...ids, ...o };
      return new SmsService({ get: (k: string) => values[k] } as never, prisma as never);
    };
    const sent = async (svc: SmsService, kind: Parameters<SmsService["orderSms"]>[1], extra?: { code?: string }) => {
      const fetchMock = mockProvider({ statusCode: 200, state: "SUBMIT_ACCEPTED" });
      await svc.orderSms("o1", kind, extra);
      if (!fetchMock.mock.calls.length) return null;
      return Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams);
    };

    it("fills each approved template with the right values and Content Id", async () => {
      const svc = make();
      expect(await sent(svc, "sampleOtp", { code: "4821" })).toMatchObject({
        text: "MD PATH LAB - Your sample collection OTP is 4821. Share it with the phlebotomist only at the time of collection.",
        dltContentId: "1777179145424890283",
      });
      expect(await sent(svc, "phleboAssigned")).toMatchObject({
        text: "MD PATH LAB - Phlebotomist Rahul is assigned to your booking MD10234. Our team will contact you soon.",
        dltContentId: "1777179145437107196",
      });
      expect(await sent(svc, "onTheWay")).toMatchObject({
        text: "MD PATH LAB - Your phlebotomist is on the way for booking MD10234. Please keep your sample collection details ready.",
        dltContentId: "1777179145443648090",
      });
      expect(await sent(svc, "reportReady")).toMatchObject({
        text: "MD PATH LAB - Your report for booking MD10234 is ready. Please log in to the app or website to view and download it.",
        dltContentId: "1777179145450602392",
      });
      expect(await sent(svc, "bookingCancelled")).toMatchObject({
        text: "MD PATH LAB - Your booking MD10234 has been cancelled. For any help call 9876500000.",
        dltContentId: "1777179145457742135",
      });
    });

    it("sends these five under the MDPLBS header, but booking-confirmed under the default sender", async () => {
      expect((await sent(make(), "onTheWay"))?.from).toBe("MDPLBS");
      expect((await sent(make({ SMS_ORDER_SENDER_ID: "ABCDEF" }), "reportReady"))?.from).toBe("ABCDEF");
      expect((await sent(make({ SMS_BOOKING_DLT_CONTENT_ID: "1707178038342504631" }), "bookingConfirmed"))?.from).toBe("MDLAB");
    });

    it("skips an event whose Content Id is not set, a missing OTP code, or a cancellation with no support phone", async () => {
      expect(await sent(make({ SMS_REPORT_READY_DLT_CONTENT_ID: "" }), "reportReady")).toBeNull();
      expect(await sent(make(), "sampleOtp")).toBeNull();
      expect(await sent(make({}, null), "bookingCancelled")).toBeNull();
    });
  });
});
