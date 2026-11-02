// Customer-facing report fields: a readable file name and the times, on GET /orders, GET /orders/:id and GET /reports.
// Only released (APPROVED) reports ever reach these endpoints; fileUrl is signed on the way out by
// SignUploadUrlsInterceptor (valid for an hour — the apps fetch a fresh one before each view/download).

type ReportRow = { id: string; fileUrl: string | null; status: string; createdAt: Date; approvedAt: Date | null };
type ItemRow = { itemName: string };

/** "MDP-2026-ABC – CBC, Lipid Profile.pdf" (long test lists shortened). */
export function reportFileName(orderNumber: string, items: ItemRow[]): string {
  const names = [...new Set(items.map((i) => i.itemName))];
  const tests = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
  return `${orderNumber}${tests ? ` – ${tests}` : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
}

/** Each report gets name / uploadedAt / releasedAt; the order gets hasReport and reportCount. */
export function withReports<T extends { orderNumber: string; items: ItemRow[]; reports: ReportRow[] }>(order: T) {
  const reports = order.reports.map((r, i) => ({
    ...r,
    // A corrected re-upload keeps the same base name with a number, so two files never look identical.
    name: order.reports.length > 1 ? reportFileName(order.orderNumber, order.items).replace(/\.pdf$/, ` (${i + 1}).pdf`) : reportFileName(order.orderNumber, order.items),
    uploadedAt: r.createdAt,
    releasedAt: r.approvedAt,
  }));
  const out: Omit<T, 'reports'> & { reports: typeof reports; hasReport: boolean; reportCount: number } = { ...order, reports, hasReport: reports.length > 0, reportCount: reports.length };
  return out;
}
