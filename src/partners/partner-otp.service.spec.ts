import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { PartnerOtpService } from './partner-otp.service';

// Minimal in-memory stand-in for the ioredis calls PartnerOtpService makes, recording every key it touches.
function fakeRedis() {
  const hashes = new Map<string, Record<string, string>>();
  const strings = new Map<string, string>();
  const expiry = new Map<string, number>();
  const touched = new Set<string>();
  const ttl = (key: string) => {
    touched.add(key);
    if (!hashes.has(key) && !strings.has(key)) return -2;
    const at = expiry.get(key);
    return at === undefined ? -1 : Math.max(1, Math.ceil((at - Date.now()) / 1000));
  };
  const ops = {
    del: (key: string) => {
      touched.add(key);
      const had = hashes.delete(key) || strings.delete(key);
      expiry.delete(key);
      return had ? 1 : 0;
    },
    hset: (key: string, values: Record<string, string>) => {
      touched.add(key);
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...values });
      return 1;
    },
    expire: (key: string, seconds: number) => {
      touched.add(key);
      expiry.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    hincrby: (key: string, field: string, by: number) => {
      touched.add(key);
      const h = hashes.get(key) ?? {};
      h[field] = String(Number(h[field] ?? 0) + by);
      hashes.set(key, h);
      return Number(h[field]);
    },
    ttl,
  };
  const multi = () => {
    const queued: Array<() => unknown> = [];
    const chain: Record<string, unknown> = {
      exec: async () => queued.map((fn) => [null, fn()]),
    };
    for (const name of Object.keys(ops) as (keyof typeof ops)[]) {
      chain[name] = (...args: unknown[]) => {
        queued.push(() => (ops[name] as (...a: unknown[]) => unknown)(...args));
        return chain;
      };
    }
    return chain;
  };
  return {
    touched,
    hashes,
    expireNow: (key: string) => {
      hashes.delete(key);
      expiry.delete(key);
    },
    redis: {
      ttl: async (key: string) => ttl(key),
      set: async (key: string, value: string, _ex: string, seconds: number) => {
        touched.add(key);
        strings.set(key, value);
        expiry.set(key, Date.now() + seconds * 1000);
        return 'OK';
      },
      hget: async (key: string, field: string) => {
        touched.add(key);
        return hashes.get(key)?.[field] ?? null;
      },
      del: async (key: string) => ops.del(key),
      multi,
    },
  };
}

function setup(opts: { smsConfigured?: boolean; env?: Record<string, string> } = {}) {
  const r = fakeRedis();
  const sms = { isConfigured: () => opts.smsConfigured ?? false, sendOtp: jest.fn().mockResolvedValue(undefined) };
  const env: Record<string, string> = { OTP_DEV_ECHO: 'true', OTP_MAX_ATTEMPTS: '3', ...opts.env };
  const config = { get: (key: string, fallback?: unknown) => env[key] ?? fallback };
  const service = new PartnerOtpService(r.redis as never, sms as never, config as never);
  return { service, sms, ...r };
}

describe('PartnerOtpService', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('uses only partner:otp:* keys — never the patient otp:cooldown:* keys', async () => {
    const { service, touched } = setup();
    const { devCode } = await service.request('9876501234');
    await service.verify('9876501234', devCode!);
    expect([...touched].every((k) => k.startsWith('partner:otp:'))).toBe(true);
    expect([...touched].some((k) => k.startsWith('otp:cooldown:'))).toBe(false);
  });

  it('stores a hash, never the code itself', async () => {
    const { service, hashes } = setup();
    const { devCode } = await service.request('9876501234');
    const stored = hashes.get(PartnerOtpService.codeKey('9876501234'))!;
    expect(stored.hash).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(devCode!);
  });

  it('accepts the right code exactly once', async () => {
    const { service } = setup();
    const { devCode } = await service.request('9876501234');
    await expect(service.verify('9876501234', devCode!)).resolves.toBeUndefined();
    await expect(service.verify('9876501234', devCode!)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks the code after the maximum number of wrong attempts, even for the right code', async () => {
    const { service } = setup();
    const { devCode } = await service.request('9876501234');
    const wrong = devCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 3; i++) await expect(service.verify('9876501234', wrong)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verify('9876501234', devCode!)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when there is no active code (expired or never requested)', async () => {
    const { service, expireNow } = setup();
    await expect(service.verify('9876501234', '123456')).rejects.toBeInstanceOf(BadRequestException);
    const { devCode } = await service.request('9876501234');
    expireNow(PartnerOtpService.codeKey('9876501234'));
    await expect(service.verify('9876501234', devCode!)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not leave a key without expiry when the code expires mid-check', async () => {
    const { service, redis, hashes, expireNow } = setup();
    const { devCode } = await service.request('9876501234');
    const key = PartnerOtpService.codeKey('9876501234');
    const realHget = redis.hget;
    redis.hget = async (k: string, f: string) => {
      const value = await realHget(k, f);
      expireNow(key); // expires right after it was read
      return value;
    };
    await expect(service.verify('9876501234', devCode!)).rejects.toBeInstanceOf(BadRequestException);
    expect(hashes.has(key)).toBe(false);
  });

  it('enforces the resend cooldown', async () => {
    const { service } = setup();
    await service.request('9876501234');
    await expect(service.request('9876501234')).rejects.toBeInstanceOf(HttpException);
  });

  it('echoes the code only in local development without SMS — same rule as the patient login', async () => {
    expect((await setup().service.request('9876501234')).devCode).toMatch(/^\d{6}$/);
    expect((await setup({ smsConfigured: true }).service.request('9876501234')).devCode).toBeUndefined();
    expect((await setup({ env: { NODE_ENV: 'production' } }).service.request('9876501234')).devCode).toBeUndefined();
    expect((await setup({ env: { OTP_DEV_ECHO: 'false' } }).service.request('9876501234')).devCode).toBeUndefined();
  });

  it('sends by SMS when configured, with no code in the response', async () => {
    const { service, sms } = setup({ smsConfigured: true });
    const res = await service.request('9876501234');
    expect(sms.sendOtp).toHaveBeenCalledWith('9876501234', expect.stringMatching(/^\d{6}$/));
    expect(res).not.toHaveProperty('devCode');
  });
});
