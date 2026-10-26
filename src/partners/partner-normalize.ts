// Registration numbers and authority names are compared for duplicates, so they are stored in one canonical form:
// "mmc / 12 345" and "MMC/12345" must be the same doctor.

/** Trims and collapses inner whitespace; empty becomes null. */
export function cleanText(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, ' ').trim();
  return v ? v : null;
}

/**
 * Registration / licence numbers: letters and digits only, upper-case. Spaces and punctuation are how the same
 * number gets typed differently ("CE-9001", "CE 9001", "CE/9001"), so they are dropped for duplicate checks.
 */
export function normalizeRegistrationNumber(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return v ? v : null;
}

/** Council / authority names: upper-case, single spaces — "Rajasthan  medical council" = "RAJASTHAN MEDICAL COUNCIL". */
export function normalizeAuthority(value: string | null | undefined): string | null {
  const v = cleanText(value);
  return v ? v.toUpperCase() : null;
}

export function normalizeGstin(value: string | null | undefined): string | null {
  return normalizeRegistrationNumber(value);
}

/** Lower-cased email, or null. Contact only — never verified and never used to match anyone. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase();
  return v ? v : null;
}
