import type { Order } from "@/lib/api";
import { ORDER_STATUS_META } from "@/lib/orderStatus";

// Derived entirely from real booking data already on the Order (statusLogs written by the
// backend on every real transition, report approvals) — there is no SMS/WhatsApp/push delivery
// behind this yet, so this is presented as an in-app activity feed, never as "sent" anywhere.
export type NotificationEntry = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

export function deriveNotifications(orders: Order[]): NotificationEntry[] {
  const entries: NotificationEntry[] = [];

  for (const order of orders) {
    for (const log of order.statusLogs ?? []) {
      if (log.status === "PENDING_PAYMENT") continue; // the moment of booking, not an update
      entries.push({
        id: `${order.id}-log-${log.id}`,
        title: `${order.orderNumber} — ${ORDER_STATUS_META[log.status]?.label ?? log.status}`,
        detail: log.note ?? "",
        createdAt: log.createdAt,
      });
    }
    for (const report of order.reports) {
      if (report.approvedAt) {
        entries.push({
          id: `${order.id}-report-${report.id}`,
          title: `Report ready — ${order.orderNumber}`,
          detail: "Your report has been reviewed and released.",
          createdAt: report.approvedAt,
        });
      }
    }
  }

  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
}
