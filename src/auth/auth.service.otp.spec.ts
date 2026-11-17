import { ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService, parseFixedOtpCodes } from './auth.service';

function setup(opts: { smsConfigured: boolean; smsFails?: boolean; devEcho?: boolean; fixed?: string }) {
  const prisma = { otpChallenge: { create: jest.fn().mockResolvedValue({}) } };
  const redis = { ttl: jest.fn().mockResolvedValue(-2), set: jest.fn().mockResolvedValue('OK') };
  const values: Record<string, string> = { OTP_DEV_ECHO: opts.devEcho ? 'true' : 'false', NODE_ENV: 'development', OTP_FIXED_CODES: opts.fixed ?? '' };
  const config = { get: (k: string, fallback?: unknown) => values[k] ?? fallback };
  const sms = {
    isConfigured: () => opts.smsConfigured,
    sendOtp: opts.smsFails ? jest.fn().mockRejectedValue(new Error('balance')) : jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(prisma as never, redis as never, {} as never, config as never, sms as never, { welcome: jest.fn() } as never);
  return { service, sms, redis, prisma };
}

describe('AuthService.requestOtp with the SMS gateway', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('sends the OTP by SMS and never returns or logs the code', async () => {
    const { service, sms } = setup({ smsConfigured: true, devEcho: true });
    const res = await service.requestOtp('9876543210');

    expect(sms.sendOtp).toHaveBeenCalledWith('9876543210', expect.stringMatching(/^\d{6}$/));
    expect(res).not.toHaveProperty('devCode'); // even with OTP_DEV_ECHO=true
    expect(console.log).not.toHaveBeenCalled();
  });

  it('returns a clear 503 and allows an immediate retry when the SMS fails', async () => {
    const { service, redis } = setup({ smsConfigured: true, smsFails: true });

    await expect(service.requestOtp('9876543210')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.set).not.toHaveBeenCalled(); // no resend cooldown
  });

  it('keeps the local-development behaviour when SMS is not configured', async () => {
    const { service, sms } = setup({ smsConfigured: false, devEcho: true });
    const res = await service.requestOtp('9876543210');

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(res).toHaveProperty('devCode');
    expect(console.log).toHaveBeenCalled();
  });
});

describe('fixed OTP numbers (OTP_FIXED_CODES)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('parses phone:code pairs and ignores bad entries', () => {
    const m = parseFixedOtpCodes(' 8104830360:123456 ,123:111111,9000000000:12,9111111111:654321');
    expect([...m.entries()]).toEqual([['8104830360', '123456'], ['9111111111', '654321']]);
    expect(parseFixedOtpCodes(undefined).size).toBe(0);
  });

  it('gives a listed number its fixed code without sending an SMS', async () => {
    const { service, sms, prisma } = setup({ smsConfigured: true, fixed: '8104830360:123456' });
    const res = await service.requestOtp('8104830360');

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(res).not.toHaveProperty('devCode');
    const { codeHash } = prisma.otpChallenge.create.mock.calls[0][0].data;
    expect(await bcrypt.compare('123456', codeHash)).toBe(true);
  });

  it('still sends a random code by SMS to every other number', async () => {
    const { service, sms } = setup({ smsConfigured: true, fixed: '8104830360:123456' });
    await service.requestOtp('9876543210');
    expect(sms.sendOtp).toHaveBeenCalledWith('9876543210', expect.stringMatching(/^\d{6}$/));
  });
});
