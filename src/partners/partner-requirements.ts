import { PARTNER_DOCUMENT_LABELS, type PartnerDocumentKind } from './partner-document-kinds.js';

export type RequirementLevel = 'MANDATORY' | 'OPTIONAL';
export type DocumentRequirement = { documentKind: PartnerDocumentKind; level: RequirementLevel };

/** Mandatory kinds that have no active document yet, as human-readable labels (empty = complete). */
export function missingMandatoryDocuments(requirements: DocumentRequirement[], documents: { kind: string; removedAt: Date | null }[]): string[] {
  const held = new Set(documents.filter((d) => !d.removedAt).map((d) => d.kind));
  return requirements
    .filter((r) => r.level === 'MANDATORY' && !held.has(r.documentKind))
    .map((r) => PARTNER_DOCUMENT_LABELS[r.documentKind]);
}

/** A kind may be uploaded only if the applicant's requirement set asks for it (mandatory or optional). */
export function isDocumentKindAllowed(requirements: DocumentRequirement[], kind: PartnerDocumentKind): boolean {
  return requirements.some((r) => r.documentKind === kind);
}

/** A requirement set is usable for new applications only if it asks for at least one mandatory document. */
export function hasMandatoryDocument(requirements: DocumentRequirement[]): boolean {
  return requirements.some((r) => r.level === 'MANDATORY');
}

/** Stable ordering for display and for the snapshot stored at submission: mandatory first, then by kind. */
export function sortRequirements<T extends DocumentRequirement>(requirements: T[]): T[] {
  return [...requirements].sort((a, b) =>
    a.level === b.level ? a.documentKind.localeCompare(b.documentKind) : a.level === 'MANDATORY' ? -1 : 1,
  );
}
