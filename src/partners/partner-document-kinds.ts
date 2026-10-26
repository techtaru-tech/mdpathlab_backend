// Document kinds and their labels — kept free of side effects (unlike partner-documents.ts, which creates the
// upload folder on import) so pure code and tests can use them.

export type PartnerDocumentKind =
  | 'MEDICAL_REGISTRATION_CERTIFICATE'
  | 'QUALIFICATION_CERTIFICATE'
  | 'IDENTITY_PROOF'
  | 'PHOTO'
  | 'ESTABLISHMENT_REGISTRATION_CERTIFICATE'
  | 'OWNER_MEDICAL_REGISTRATION_CERTIFICATE'
  | 'ADDRESS_PROOF'
  | 'AUTHORIZATION_LETTER'
  | 'OTHER';

export const PARTNER_DOCUMENT_KINDS: readonly PartnerDocumentKind[] = [
  'MEDICAL_REGISTRATION_CERTIFICATE',
  'QUALIFICATION_CERTIFICATE',
  'IDENTITY_PROOF',
  'PHOTO',
  'ESTABLISHMENT_REGISTRATION_CERTIFICATE',
  'OWNER_MEDICAL_REGISTRATION_CERTIFICATE',
  'ADDRESS_PROOF',
  'AUTHORIZATION_LETTER',
  'OTHER',
];

export function isPartnerDocumentKind(value: unknown): value is PartnerDocumentKind {
  return typeof value === 'string' && (PARTNER_DOCUMENT_KINDS as readonly string[]).includes(value);
}

export const PARTNER_DOCUMENT_LABELS: Record<PartnerDocumentKind, string> = {
  MEDICAL_REGISTRATION_CERTIFICATE: 'Medical registration certificate',
  QUALIFICATION_CERTIFICATE: 'Qualification certificate',
  IDENTITY_PROOF: 'Identity proof',
  PHOTO: 'Photo',
  ESTABLISHMENT_REGISTRATION_CERTIFICATE: 'Establishment registration certificate',
  OWNER_MEDICAL_REGISTRATION_CERTIFICATE: "Owner doctor's medical registration certificate",
  ADDRESS_PROOF: 'Address proof',
  AUTHORIZATION_LETTER: 'Authorisation letter',
  OTHER: 'Other supporting document',
};

/** Active (not removed) documents an application may hold at once. */
export const MAX_ACTIVE_PARTNER_DOCUMENTS = 10;
/**
 * Every upload ever made by one application, removed ones included. Removal keeps the file for the record, so
 * without this an upload → remove → upload loop could fill the disk (bounded now at 30 × 10 MB per account).
 */
export const MAX_TOTAL_PARTNER_DOCUMENTS = 30;
export const MAX_PARTNER_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const PARTNER_DOCUMENTS_URL_PREFIX = '/uploads/partner-documents/';
