/**
 * The doorstep collection code is for the PATIENT only — the phlebotomist has to be told it by the patient, and the
 * lab never needs it. Every order row sent to those two roles goes through this first.
 */
export function omitCollectionOtp<T extends object>(order: T): Omit<T, 'collectionOtp' | 'collectionOtpAttempts' | 'collectionOtpLockedUntil'> {
  const { collectionOtp: _otp, collectionOtpAttempts: _attempts, collectionOtpLockedUntil: _locked, ...rest } = order as T & {
    collectionOtp?: unknown;
    collectionOtpAttempts?: unknown;
    collectionOtpLockedUntil?: unknown;
  };
  return rest;
}
