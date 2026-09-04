import type { OrderStatus } from '@prisma/client';

/**
 * Maps the existing OrderStatus enum to the phlebotomist-app vocabulary from FSD §2.2
 * ("Pending / Reached / Collected / Handed Over"). This mapping is best-effort, NOT an exact
 * FSD-defined table — see the Phase 2 implementation report for the full rationale. In short:
 *
 * - CONFIRMED / PHLEBOTOMIST_ASSIGNED / PENDING_PAYMENT → "Pending" (no collection action taken yet)
 * - SAMPLE_COLLECTED                                    → "Collected"
 * - IN_LAB / REPORT_READY                               → "Handed Over" (FSD §2.5: marking a sample
 *   "Handed Over to Lab" is what drives the order into IN_LAB; REPORT_READY is further downstream
 *   of that same handover, so it maps the same way from the phlebotomist's point of view)
 * - CANCELLED                                           → "Cancelled" (outside the FSD's 4-value
 *   vocabulary — flagged, not invented as one of the four)
 *
 * "Reached" has NO corresponding value here: the current schema has no field capturing a
 * phlebotomist having reached the patient's location (that update mechanic is FSD §2.4, explicitly
 * out of scope for this phase) — so this mapping can never produce "Reached" today. This is a
 * known, reported gap, not an oversight.
 */
export type PhlebotomistStatusLabel = 'Pending' | 'Collected' | 'Handed Over' | 'Cancelled';

export function toPhlebotomistStatusLabel(status: OrderStatus): PhlebotomistStatusLabel {
  switch (status) {
    case 'PENDING_PAYMENT':
    case 'CONFIRMED':
    case 'PHLEBOTOMIST_ASSIGNED':
      return 'Pending';
    case 'SAMPLE_COLLECTED':
      return 'Collected';
    case 'IN_LAB':
    case 'REPORT_READY':
      return 'Handed Over';
    case 'CANCELLED':
      return 'Cancelled';
  }
}
