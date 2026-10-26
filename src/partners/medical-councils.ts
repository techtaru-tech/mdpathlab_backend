// The councils a doctor's registration can be with: the National Medical Commission and the state medical councils.
// A fixed list (not free text) so the same doctor can't register twice as "RMC" and "Rajasthan Medical Council", and
// so the duplicate check — which compares council + number — is reliable. Stored upper-case, like before.
// The website shows the same list (web/src/lib/medical-councils.ts); keep the two in step.
export const MEDICAL_COUNCILS = [
  'National Medical Commission',
  'Andhra Pradesh Medical Council',
  'Arunachal Pradesh Medical Council',
  'Assam Medical Council',
  'Bihar Medical Council',
  'Chhattisgarh Medical Council',
  'Delhi Medical Council',
  'Goa Medical Council',
  'Gujarat Medical Council',
  'Haryana Medical Council',
  'Himachal Pradesh Medical Council',
  'Jammu and Kashmir Medical Council',
  'Jharkhand Medical Council',
  'Karnataka Medical Council',
  'Travancore Cochin Medical Council',
  'Madhya Pradesh Medical Council',
  'Maharashtra Medical Council',
  'Manipur Medical Council',
  'Meghalaya Medical Council',
  'Mizoram Medical Council',
  'Nagaland Medical Council',
  'Odisha Council of Medical Registration',
  'Puducherry Medical Council',
  'Punjab Medical Council',
  'Rajasthan Medical Council',
  'Sikkim Medical Council',
  'Tamil Nadu Medical Council',
  'Telangana State Medical Council',
  'Tripura State Medical Council',
  'Uttar Pradesh Medical Council',
  'Uttarakhand Medical Council',
  'West Bengal Medical Council',
] as const;

export const MEDICAL_COUNCILS_UPPER: readonly string[] = MEDICAL_COUNCILS.map((c) => c.toUpperCase());
