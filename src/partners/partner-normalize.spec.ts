import { cleanText, normalizeAuthority, normalizeEmail, normalizeGstin, normalizeRegistrationNumber } from './partner-normalize';

describe('partner field normalisation', () => {
  it('treats differently typed copies of one registration number as the same', () => {
    expect(normalizeRegistrationNumber(' mmc / 12 345 ')).toBe('MMC12345');
    expect(normalizeRegistrationNumber('MMC/12345')).toBe('MMC12345');
    // Found in Gate 1D: punctuation must not create a "different" number.
    for (const typed of ['CE-9001', 'CE 9001', 'ce/9001', 'C.E. 9001']) expect(normalizeRegistrationNumber(typed)).toBe('CE9001');
  });

  it('treats differently typed council names as the same council', () => {
    expect(normalizeAuthority('  Rajasthan   medical council ')).toBe('RAJASTHAN MEDICAL COUNCIL');
  });

  it('turns blanks into null rather than an empty string (so NULL-distinct uniqueness applies)', () => {
    expect(normalizeRegistrationNumber('   ')).toBeNull();
    expect(normalizeRegistrationNumber(' - / ')).toBeNull();
    expect(normalizeAuthority('')).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(normalizeGstin(null)).toBeNull();
    expect(normalizeEmail(' ')).toBeNull();
  });

  it('cleans free text and emails', () => {
    expect(cleanText('  Dr  Asha   Rao ')).toBe('Dr Asha Rao');
    expect(normalizeEmail(' Asha@Example.COM ')).toBe('asha@example.com');
    expect(normalizeGstin('08abcde1234f1z5')).toBe('08ABCDE1234F1Z5');
  });
});
