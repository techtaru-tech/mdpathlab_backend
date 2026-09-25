// Shared by the lab and admin booking views so both word "this booking needs a phlebotomist
// decision" the same way. Purely derived from the booking as loaded — nothing is written.
type AttentionInput = {
  collectionType: "HOME" | "CENTER";
  status: string;
  phlebotomist: { status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" } | null;
  assignmentRejectedReason: string | null;
};

export type AssignmentAttention = { tone: "danger" | "warning"; label: string };

const PHLEBO_STATUS_LABEL = { ON_LEAVE: "on leave", INACTIVE: "inactive" } as const;

export function assignmentAttention(order: AttentionInput): AssignmentAttention | null {
  // Only bookings still waiting for a collection can need a phlebotomist decision.
  if (order.collectionType !== "HOME") return null;
  if (order.status !== "CONFIRMED" && order.status !== "PHLEBOTOMIST_ASSIGNED") return null;

  if (order.phlebotomist && order.phlebotomist.status !== "ACTIVE") {
    return { tone: "danger", label: `Assigned phlebotomist is ${PHLEBO_STATUS_LABEL[order.phlebotomist.status]} — reassign` };
  }
  if (!order.phlebotomist) {
    return {
      tone: "warning",
      label: order.assignmentRejectedReason ? `Assignment pending — declined: ${order.assignmentRejectedReason}` : "Assignment pending",
    };
  }
  return null;
}
