import { BankCrypto } from './bank-crypto';

const config = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as never;

describe('bank account numbers are stored encrypted', () => {
  it('round-trips, never contains the number, and differs every time', () => {
    const c = new BankCrypto(config({ JWT_SECRET: 'jwt-secret' }));
    const a = c.encrypt('123456789012');
    const b = c.encrypt('123456789012');
    expect(a).not.toContain('123456789012');
    expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe('123456789012');
    expect(a.startsWith('v1.j.')).toBe(true);
  });

  it('uses BANK_DETAILS_KEY when set, and still reads rows written before it was added', () => {
    const before = new BankCrypto(config({ JWT_SECRET: 'jwt-secret' })).encrypt('11112222333');
    const withKey = new BankCrypto(config({ JWT_SECRET: 'jwt-secret', BANK_DETAILS_KEY: 'dedicated' }));
    const after = withKey.encrypt('44445555666');
    expect(after.startsWith('v1.k.')).toBe(true);
    expect(withKey.decrypt(before)).toBe('11112222333');
    expect(withKey.decrypt(after)).toBe('44445555666');
  });

  it('a tampered value or a different secret is refused, not silently misread', () => {
    const c = new BankCrypto(config({ JWT_SECRET: 'jwt-secret' }));
    const stored = c.encrypt('123456789012');
    const parts = stored.split('.');
    parts[4] = Buffer.from('999999999999').toString('base64');
    expect(() => c.decrypt(parts.join('.'))).toThrow();
    expect(() => new BankCrypto(config({ JWT_SECRET: 'another-secret' })).decrypt(stored)).toThrow();
    expect(() => c.decrypt('garbage')).toThrow();
  });
});
