import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Upload } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  adminOrdersApi,
  adminPhlebotomistsApi,
  adminReportsApi,
  type AdminOrder,
  type AdminOrderStatus,
  type AdminPhlebotomist,
} from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminBookingsPage,
});

const STATUSES: AdminOrderStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PHLEBOTOMIST_ASSIGNED",
  "SAMPLE_COLLECTED",
  "IN_LAB",
  "REPORT_READY",
  "CANCELLED",
];

const statusTint: Record<AdminOrderStatus, string> = {
  PENDING_PAYMENT: "bg-warning/15 text-warning",
  CONFIRMED: "bg-success-soft text-success",
  PHLEBOTOMIST_ASSIGNED: "bg-primary-soft text-primary",
  SAMPLE_COLLECTED: "bg-secondary-soft text-secondary",
  IN_LAB: "bg-secondary-soft text-secondary",
  REPORT_READY: "bg-success-soft text-success",
  CANCELLED: "bg-destructive/10 text-destructive",
};

function AdminBookingsPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<AdminPhlebotomist[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(status?: string) {
    setLoading(true);
    adminOrdersApi
      .list(status || undefined)
      .then(setOrders)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    adminPhlebotomistsApi.list().then(setPhlebotomists);
  }, []);

  async function handleStatusChange(order: AdminOrder, status: AdminOrderStatus) {
    setSavingId(order.id);
    try {
      const updated = await adminOrdersApi.updateStatus(order.id, { status });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAssign(order: AdminOrder, phlebotomistId: string) {
    if (!phlebotomistId) return;
    setSavingId(order.id);
    try {
      const updated = await adminOrdersApi.updateStatus(order.id, {
        status: order.status === "CONFIRMED" ? "PHLEBOTOMIST_ASSIGNED" : order.status,
        phlebotomistId,
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleUploadReport(order: AdminOrder, file: File) {
    setSavingId(order.id);
    try {
      const report = await adminReportsApi.upload(order.id, file);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, reports: [...o.reports, report] } : o)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleApproveReport(order: AdminOrder, reportId: string) {
    setSavingId(order.id);
    try {
      await adminReportsApi.approve(reportId);
      setOrders(await adminOrdersApi.list(filter || undefined));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminLayout activePath="/admin/bookings">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orders.length} loaded</p>
        </div>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            load(e.target.value);
          }}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings found.</p>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">{o.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.items.map((i) => i.itemName).join(", ")} · {o.user.phone}
                    {o.user.name ? ` (${o.user.name})` : ""}
                  </p>
                  {o.address ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.address.line1}, {o.address.city} {o.slot ? `· ${o.slot.label}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-primary">₹{o.total}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.paymentMethod} · {o.paymentStatus}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", statusTint[o.status])}>
                  {o.status}
                </span>

                <select
                  value={o.status}
                  disabled={savingId === o.id}
                  onChange={(e) => handleStatusChange(o, e.target.value as AdminOrderStatus)}
                  className="h-9 rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      Set: {s}
                    </option>
                  ))}
                </select>

                <select
                  defaultValue=""
                  disabled={savingId === o.id}
                  onChange={(e) => handleAssign(o, e.target.value)}
                  className="h-9 rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none"
                >
                  <option value="" disabled>
                    {o.phlebotomist ? `Assigned: ${o.phlebotomist.user.name ?? o.phlebotomist.user.phone}` : "Assign phlebotomist…"}
                  </option>
                  {phlebotomists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.user.name ?? p.user.phone} ({p.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-4">
                {o.reports.length > 0 ? (
                  o.reports.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <a href={apiFileUrl(r.fileUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                        Report ({new Date(r.createdAt).toLocaleDateString("en-IN")})
                      </a>
                      {r.status === "APPROVED" ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                          Approved
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={savingId === o.id}
                          onClick={() => handleApproveReport(o, r.id)}
                          className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning hover:bg-warning/25"
                        >
                          Approve & release
                        </button>
                      )}
                    </div>
                  ))
                ) : null}

                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold text-primary hover:bg-primary-soft">
                  <Upload className="h-3.5 w-3.5" /> Upload report (PDF)
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={savingId === o.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadReport(o, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
