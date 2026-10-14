import { Transform } from 'class-transformer';

const GENDERS: Record<string, 'MALE' | 'FEMALE' | 'OTHER'> = {
  male: 'MALE',
  m: 'MALE',
  female: 'FEMALE',
  f: 'FEMALE',
  other: 'OTHER',
  o: 'OTHER',
};

/**
 * Accepts gender the way apps and forms send it — "Male", "male", "M", "FEMALE", … — and stores MALE / FEMALE /
 * OTHER. Anything else is passed through unchanged so @IsIn still rejects it with a clear message; an empty value
 * counts as not given.
 */
export const NormalizeGender = () =>
  Transform(({ value }) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const v = value.trim();
    if (v === '') return undefined;
    return GENDERS[v.toLowerCase()] ?? v;
  });

/** "25" (text) → 25; real numbers and anything non-numeric are left for the validators. */
export const NumberFromString = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)) ? Number(value) : value));
