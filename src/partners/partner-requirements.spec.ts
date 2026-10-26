import { hasMandatoryDocument, isDocumentKindAllowed, missingMandatoryDocuments, sortRequirements, type DocumentRequirement } from './partner-requirements';

// Mirrors the seeded defaults: a single-doctor clinic and a hospital are asked for different documents.
const SOLO_CLINIC: DocumentRequirement[] = [
  { documentKind: 'OWNER_MEDICAL_REGISTRATION_CERTIFICATE', level: 'MANDATORY' },
  { documentKind: 'IDENTITY_PROOF', level: 'MANDATORY' },
  { documentKind: 'ADDRESS_PROOF', level: 'MANDATORY' },
  { documentKind: 'ESTABLISHMENT_REGISTRATION_CERTIFICATE', level: 'OPTIONAL' },
];
const HOSPITAL: DocumentRequirement[] = [
  { documentKind: 'ESTABLISHMENT_REGISTRATION_CERTIFICATE', level: 'MANDATORY' },
  { documentKind: 'IDENTITY_PROOF', level: 'MANDATORY' },
  { documentKind: 'AUTHORIZATION_LETTER', level: 'MANDATORY' },
  { documentKind: 'ADDRESS_PROOF', level: 'OPTIONAL' },
];

const doc = (kind: string, removed = false) => ({ kind, removedAt: removed ? new Date() : null });

describe('partner document requirements', () => {
  it('reports every mandatory document that is missing, by label', () => {
    expect(missingMandatoryDocuments(HOSPITAL, [doc('IDENTITY_PROOF')])).toEqual([
      'Establishment registration certificate',
      'Authorisation letter',
    ]);
  });

  it('never requires an optional document', () => {
    expect(
      missingMandatoryDocuments(SOLO_CLINIC, [doc('OWNER_MEDICAL_REGISTRATION_CERTIFICATE'), doc('IDENTITY_PROOF'), doc('ADDRESS_PROOF')]),
    ).toEqual([]);
  });

  it('does not count a removed document', () => {
    expect(missingMandatoryDocuments(HOSPITAL, [doc('ESTABLISHMENT_REGISTRATION_CERTIFICATE', true), doc('IDENTITY_PROOF'), doc('AUTHORIZATION_LETTER')])).toEqual([
      'Establishment registration certificate',
    ]);
  });

  it('depends on the clinic type: the same documents satisfy one type and not the other', () => {
    const soloDocs = [doc('OWNER_MEDICAL_REGISTRATION_CERTIFICATE'), doc('IDENTITY_PROOF'), doc('ADDRESS_PROOF')];
    expect(missingMandatoryDocuments(SOLO_CLINIC, soloDocs)).toEqual([]);
    expect(missingMandatoryDocuments(HOSPITAL, soloDocs)).not.toEqual([]);
  });

  it('accepts uploads only of kinds the requirement set asks for', () => {
    expect(isDocumentKindAllowed(HOSPITAL, 'AUTHORIZATION_LETTER')).toBe(true);
    expect(isDocumentKindAllowed(HOSPITAL, 'ADDRESS_PROOF')).toBe(true);
    expect(isDocumentKindAllowed(HOSPITAL, 'MEDICAL_REGISTRATION_CERTIFICATE')).toBe(false);
    expect(isDocumentKindAllowed([], 'OTHER')).toBe(false);
  });

  it('treats a set with no mandatory document as not usable', () => {
    expect(hasMandatoryDocument(HOSPITAL)).toBe(true);
    expect(hasMandatoryDocument([{ documentKind: 'OTHER', level: 'OPTIONAL' }])).toBe(false);
    expect(hasMandatoryDocument([])).toBe(false);
  });

  it('orders mandatory before optional, stably', () => {
    const sorted = sortRequirements([...HOSPITAL].reverse());
    expect(sorted.map((r) => r.level)).toEqual(['MANDATORY', 'MANDATORY', 'MANDATORY', 'OPTIONAL']);
    expect(sortRequirements(sorted)).toEqual(sorted);
  });
});
