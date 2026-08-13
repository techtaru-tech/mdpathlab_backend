import type { OrderStatus } from "@/lib/api";

// Single source of truth for how an order status renders — reused by the dashboard's booking
// list, the booking detail/tracking page and anywhere else a status needs a label/tint.
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tint: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tint: "bg-warning/15 text-warning" },
  CONFIRMED: { label: "Confirmed", tint: "bg-success-soft text-success" },
  PHLEBOTOMIST_ASSIGNED: { label: "Phlebotomist assigned", tint: "bg-primary-soft text-primary" },
  SAMPLE_COLLECTED: { label: "Sample collected", tint: "bg-secondary-soft text-secondary" },
  IN_LAB: { label: "In lab", tint: "bg-secondary-soft text-secondary" },
  REPORT_READY: { label: "Report ready", tint: "bg-success-soft text-success" },
  CANCELLED: { label: "Cancelled", tint: "bg-destructive/10 text-destructive" },
};

// The FSD's linear tracking chain — CANCELLED is a terminal branch handled separately by the
// UI, not a step in this sequence. Only statuses the backend actually emits appear here.
export const ORDER_STATUS_TIMELINE: OrderStatus[] = [
  "CONFIRMED",
  "PHLEBOTOMIST_ASSIGNED",
  "SAMPLE_COLLECTED",
  "IN_LAB",
  "REPORT_READY",
];
