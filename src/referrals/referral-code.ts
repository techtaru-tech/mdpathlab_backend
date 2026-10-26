import { randomInt } from 'crypto';

// Crockford-style alphabet without look-alikes (no 0/O, 1/I/L, U), so a code read off a printed QR card or typed
// from a prescription pad is not mistaken for another one.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERRAL_CODE_PATTERN = /^MD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/** "MD" + 8 random characters (~39 bits) — not derived from the partner's name, so codes cannot be guessed. */
export function generateReferralCode(): string {
  let out = 'MD';
  for (let i = 0; i < 8; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** What a person typed or what came from a link → canonical form, or null when it cannot be a code. */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\s-]/g, '').toUpperCase();
  return REFERRAL_CODE_PATTERN.test(v) ? v : null;
}

export function referralLink(appUrl: string, code: string, source: 'LINK' | 'QR' = 'LINK'): string {
  return `${appUrl.replace(/\/+$/, '')}/r/${code}${source === 'QR' ? '?src=qr' : ''}`;
}
