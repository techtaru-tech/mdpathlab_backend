import { useMemo, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Clock, FileText, MapPin, Search, Upload, User } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  AdminApiError,
  adminOrdersApi,
  adminPhlebotomistsApi,
  adminReportsApi,
  type AdminOrder,
  type AdminOrderStatus,
  type AdminPhlebotomist,
} from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/admin/bookings/")({
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

const statusTone: Record<AdminOrderStatus, "warning" | "success" | "primary" | "secondary" | "danger"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  PHLEBOTOMIST_ASSIGNED: "primary",
  SAMPLE_COLLECTED: "secondary",
  IN_LAB: "secondary",
  REPORT_READY: "success",
  CANCELLED: "danger",
};

const statusLabel: Record<AdminOrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PHLEBOTOMIST_ASSIGNED: "Phlebotomist assigned",
  SAMPLE_COLLECTED: "Sample collected",
  IN_LAB: "In lab",
  REPORT_READY: "Report ready",
  CANCELLED: "Cancelled",
};

const PAGE_SIZE = 8;

function BookingCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-2.5 h-3 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
    </div>
  );
}

function AdminBookingsPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<AdminPhlebotomist[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // FSD §3.8 — "assign ... to an available phlebotomist by area and slot." "Available" = ACTIVE
  // (hard filter — the backend rejects INACTIVE/ON_LEAVE assignment attempts too, this just keeps
  // the admin from picking one in the first place). "Area" has no strict zone model in this
  // schema (only free-text coverageCity), so it's a soft sort-to-top hint, not a hard filter —
  // every ACTIVE phlebotomist stays selectable regardless of city.
  function activePhlebotomists(bookingCity: string | undefined) {
    return [...phlebotomists]
      .filter((p) => p.status === "ACTIVE")
      .sort((a, b) => {
        const aMatch = bookingCity && a.coverageCity === bookingCity ? 0 : 1;
        const bMatch = bookingCity && b.coverageCity === bookingCity ? 0 : 1;
        return aMatch - bMatch;
      });
  }

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
    setActionError("");
    try {
      const updated = await adminOrdersApi.updateStatus(order.id, { status });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't update status");
    } finally {
      setSavingId(null);
    }
  }

  async function handleAssign(order: AdminOrder, phlebotomistId: string) {
    if (!phlebotomistId || order.status === "CANCELLED") return;
    setSavingId(order.id);
    setActionError("");
    try {
      const updated = await adminOrdersApi.updateStatus(order.id, {
        status: order.status === "CONFIRMED" ? "PHLEBOTOMIST_ASSIGNED" : order.status,
        phlebotomistId,
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't assign phlebotomist");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUploadReport(order: AdminOrder, file: File) {
    setSavingId(order.id);
    setActionError("");
    try {
      const report = await adminReportsApi.upload(order.id, file);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, reports: [...o.reports, report] } : o)));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't upload report");
    } finally {
      setSavingId(null);
    }
  }

  async function handleApproveReport(order: AdminOrder, reportId: string) {
    setSavingId(order.id);
    setActionError("");
    try {
      await adminReportsApi.approve(reportId);
      setOrders(await adminOrdersApi.list(filter || undefined));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't approve report");
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const haystack = [
        o.orderNumber,
        o.user.phone,
        o.user.name,
        o.address?.line1,
        o.address?.city,
        o.slot?.label,
        o.phlebotomist?.user.name,
        o.phlebotomist?.user.phone,
        o.paymentMethod,
        o.paymentStatus,
        ...o.items.map((i) => i.itemName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search]);

  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, `${search}|${filter}`);

  return (
    <AdminLayout activePath="/admin/bookings">
      <AdminPageHeader
        title="Bookings"
        description={`${filtered.length} of ${orders.length} loaded`}
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order #, phone, name, address, item, phlebotomist…"
                className="w-44 bg-transparent text-sm focus:outline-none sm:w-64"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                load(e.target.value);
              }}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </>
        }
      />

      {actionError ? (
        <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{actionError}</p>
      ) : null}

      <div className="mt-6 space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => <BookingCardSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-14 text-center shadow-sm">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">No bookings match.</p>
          </div>
        ) : (
          paged.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/admin/bookings/$orderId" params={{ orderId: o.id }} className="text-sm font-extrabold hover:underline">
                      {o.orderNumber}
                    </Link>
                    <StatusBadge tone={statusTone[o.status]}>{statusLabel[o.status]}</StatusBadge>
                    <Link
                      to="/admin/bookings/$orderId"
                      params={{ orderId: o.id }}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      View details →
                    </Link>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-foreground/80">{o.items.map((i) => i.itemName).join(", ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-primary tabular-nums">₹{o.total}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {o.paymentMethod} · {o.paymentStatus}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 grid gap-1.5 border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" /> {o.user.phone}
                  {o.user.name ? ` · ${o.user.name}` : ""}
                </span>
                {o.address ? (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {o.address.line1}, {o.address.city}
                  </span>
                ) : null}
                {o.slot ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" /> {o.slot.label}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2.5 border-t border-border pt-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Update status
                  </span>
                  <select
                    value={o.status}
                    disabled={savingId === o.id}
                    onChange={(e) => handleStatusChange(o, e.target.value as AdminOrderStatus)}
                    className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Phlebotomist
                  </span>
                  <select
                    value=""
                    disabled={savingId === o.id || o.status === "CANCELLED" || o.collectionType === "CENTER"}
                    onChange={(e) => handleAssign(o, e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none disabled:opacity-60"
                  >
                    <option value="" disabled>
                      {o.collectionType === "CENTER"
                        ? "Center booking — no phlebotomist needed"
                        : o.phlebotomist
                          ? `Assigned: ${o.phlebotomist.user.name ?? o.phlebotomist.user.phone}`
                          : "Not yet assigned"}
                    </option>
                    {activePhlebotomists(o.address?.city).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.user.name ?? p.user.phone} ({p.employeeCode})
                        {p.coverageCity && o.address?.city && p.coverageCity === o.address.city ? " — same city" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 border-t border-dashed border-border pt-3">
                <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Reports</span>
                <div className="flex flex-wrap items-center gap-2">
                  {o.reports.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <a href={apiFileUrl(r.fileUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                        Report · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                      </a>
                      {r.status === "APPROVED" ? (
                        <StatusBadge tone="success">Approved</StatusBadge>
                      ) : (
                        <button
                          type="button"
                          disabled={savingId === o.id}
                          onClick={() => handleApproveReport(o, r.id)}
                          className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning hover:bg-warning/25"
                        >
                          Approve &amp; release
                        </button>
                      )}
                    </div>
                  ))}

                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft">
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
            </div>
          ))
        )}
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
