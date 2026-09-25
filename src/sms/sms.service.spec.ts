import { SmsSendError, SmsService } from './sms.service';

const CONFIG = {
  SMS_API_BASE_URL: 'https://smsweb.kanpurcityonline.com/',
  SMS_API_USERNAME: 'mdpath.trans',
  SMS_API_PASSWORD: 's3cret&pass',
  SMS_SENDER_ID: 'MDPLBS',
  SMS_OTP_DLT_CONTENT_ID: '1701178022625968309',
};

function makeService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = { ...CONFIG, ...overrides };
  return new SmsService({ get: (k: string) => values[k] } as never);
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
      from: 'MDPLBS',
      to: '919876543210', // India country code added to a 10-digit number
      text: '482913 is your MD Path Lab verification code. It is valid for 5 minutes. Do not share it with anyone.',
      dltContentId: '1701178022625968309',
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
});
