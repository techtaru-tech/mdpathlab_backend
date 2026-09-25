import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';

function setup(opts: { smsConfigured: boolean; smsFails?: boolean; devEcho?: boolean }) {
  const prisma = { otpChallenge: { create: jest.fn().mockResolvedValue({}) } };
  const redis = { ttl: jest.fn().mockResolvedValue(-2), set: jest.fn().mockResolvedValue('OK') };
  const values: Record<string, string> = { OTP_DEV_ECHO: opts.devEcho ? 'true' : 'false', NODE_ENV: 'development' };
  const config = { get: (k: string, fallback?: unknown) => values[k] ?? fallback };
  const sms = {
    isConfigured: () => opts.smsConfigured,
    sendOtp: opts.smsFails ? jest.fn().mockRejectedValue(new Error('balance')) : jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(prisma as never, redis as never, {} as never, config as never, sms as never);
  return { service, sms, redis };
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
