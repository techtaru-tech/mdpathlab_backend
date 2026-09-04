import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  CalendarCheck,
  CreditCard,
  FileText,
  History,
  MapPin,
  Package,
  Percent,
  Truck,
  Upload,
  User,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminOrdersApi,
  adminReportsApi,
  type AdminOrder,
  type AdminOrderStatus,
} from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/admin/bookings/$orderId")({
  head: () => ({ meta: [{ title: "Booking Detail — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminBookingDetailPage,
});

// Mirrors admin.bookings.tsx's own status label/tone maps — kept as a local copy rather than an
// import so this page doesn't need to reach into that file's internals for two small consts.
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

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value ?? "—"}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function AdminBookingDetailPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    adminOrdersApi
      .get(orderId)
      .then(setOrder)
      .catch((err) => setError(err instanceof AdminApiError ? err.message : "Couldn't load this booking"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [orderId]);

  async function handleUploadReport(file: File) {
    if (!order) return;
    setSavingReport(true);
    setActionError("");
    try {
      const report = await adminReportsApi.upload(order.id, file);
      setOrder((prev) => (prev ? { ...prev, reports: [...prev.reports, report] } : prev));
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't upload report");
    } finally {
      setSavingReport(false);
    }
  }

  async function handleApproveReport(reportId: string) {
    if (!order) return;
    setSavingReport(true);
    setActionError("");
    try {
      await adminReportsApi.approve(reportId);
      load();
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Couldn't approve report");
    } finally {
      setSavingReport(false);
    }
  }

  async function handleCancel() {
    if (!order || !cancelReason.trim()) return;
    if (!window.confirm(`Cancel booking ${order.orderNumber}? This cannot be undone.`)) return;
    setCancelling(true);
    setCancelError("");
    try {
      await adminOrdersApi.cancel(order.id, cancelReason.trim());
      setShowCancelForm(false);
      setCancelReason("");
      load();
    } catch (err) {
      setCancelError(err instanceof AdminApiError ? err.message : "Couldn't cancel this booking");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AdminLayout activePath="/admin/bookings">
      <Link to="/admin/bookings" className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to bookings
      </Link>

      {loading ? (
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-destructive">{error}</p>
        </div>
      ) : !order ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">Booking not found.</p>
        </div>
      ) : (
        <>
          <AdminPageHeader
            title={order.orderNumber}
            description={`Booked ${formatDate(order.createdAt)}`}
            actions={
              <>
                <StatusBadge tone={statusTone[order.status]}>{statusLabel[order.status]}</StatusBadge>
                {order.status !== "CANCELLED" ? (
                  <ActionButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancelForm((v) => !v)}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-4 w-4" /> Cancel booking
                  </ActionButton>
                ) : null}
              </>
            }
          />

          {actionError ? (
            <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{actionError}</p>
          ) : null}

          {showCancelForm && order.status !== "CANCELLED" ? (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
              <p className="text-sm font-extrabold text-destructive">Cancel this booking</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This will mark the booking as Cancelled and record it in the status history. This does not process a
                refund — refunds are handled separately.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Cancellation reason (required)"
                rows={3}
                className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
              />
              {cancelError ? <p className="mt-2 text-xs font-semibold text-destructive">{cancelError}</p> : null}
              <div className="mt-3 flex gap-2">
                <ActionButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cancelling || !cancelReason.trim()}
                  onClick={handleCancel}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  {cancelling ? "Cancelling…" : "Confirm cancellation"}
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cancelling}
                  onClick={() => {
                    setShowCancelForm(false);
                    setCancelReason("");
                    setCancelError("");
                  }}
                >
                  Never mind
                </ActionButton>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <SectionCard title="Booking Information" icon={CalendarCheck}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Order ID" value={order.id} />
                <Field label="Order number" value={order.orderNumber} />
                <Field label="Status" value={statusLabel[order.status]} />
                <Field label="Booked at" value={formatDate(order.createdAt)} />
                <Field label="Scheduled collection date" value={order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString("en-IN") : null} />
                <Field label="Slot" value={order.slot ? `${order.slot.label} (${order.slot.startTime}–${order.slot.endTime})` : null} />
              </div>
            </SectionCard>

            <SectionCard title="Patient Information" icon={User}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={order.user.name} />
                <Field label="Phone" value={order.user.phone} />
              </div>
            </SectionCard>

            <SectionCard title="Collection Information" icon={MapPin}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Collection type" value={order.collectionType === "HOME" ? "Home collection" : "Centre visit"} />
                <Field label="Collection fee" value={`₹${order.collectionFee}`} />
                {order.collectionType === "HOME" && order.address ? (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Address</p>
                    <p className="mt-0.5 text-sm font-semibold">
                      {[order.address.houseNo, order.address.line1, order.address.landmark].filter(Boolean).join(", ")}
                      <br />
                      {order.address.city}
                      {order.address.state ? `, ${order.address.state}` : ""} {order.address.pincode}
                      {order.address.phone ? ` · ${order.address.phone}` : ""}
                    </p>
                  </div>
                ) : null}
                {order.collectionType === "CENTER" ? (
                  <Field
                    label="Collection centre"
                    value={
                      order.collectionCenterId ? (
                        <span className="font-normal text-muted-foreground">
                          Centre ID {order.collectionCenterId} — name not returned by the current admin API (see implementation notes)
                        </span>
                      ) : null
                    }
                  />
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="Payment Information" icon={CreditCard}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment method" value={order.paymentMethod} />
                <Field label="Payment status" value={order.paymentStatus} />
                <Field label="Subtotal" value={`₹${order.subtotal}`} />
                <Field label="Discount" value={order.discount ? `-₹${order.discount}` : "₹0"} />
                <Field label="Collection fee" value={`₹${order.collectionFee}`} />
                <Field label="Total" value={<span className="text-primary">₹{order.total}</span>} />
                {order.couponId ? (
                  <div className="flex items-center gap-1.5 sm:col-span-2">
                    <Percent className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">
                      Coupon ID {order.couponId} — code not returned by the current admin API (see implementation notes)
                    </span>
                  </div>
                ) : null}
                {order.razorpayOrderId ? <Field label="Razorpay order ID" value={order.razorpayOrderId} /> : null}
                {order.razorpayPaymentId ? <Field label="Razorpay payment ID" value={order.razorpayPaymentId} /> : null}
                {order.collectedAmount !== null ? (
                  <>
                    <Field label="Amount collected at visit" value={`₹${order.collectedAmount}`} />
                    <Field label="Collection payment mode" value={order.collectionPaymentMode ?? "—"} />
                    {order.collectedAt ? (
                      <Field label="Collected at" value={new Date(order.collectedAt).toLocaleString("en-IN")} />
                    ) : null}
                  </>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="Ordered Items" icon={Package}>
              {order.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items on this order.</p>
              ) : (
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{item.itemName}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          {item.itemType}
                          {item.familyMemberId ? ` · Family member ID ${item.familyMemberId}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-extrabold">₹{item.price}</p>
                        {item.mrp > item.price ? <p className="text-[11px] text-muted-foreground line-through">₹{item.mrp}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Assigned Phlebotomist" icon={Truck}>
              {order.phlebotomist ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" value={order.phlebotomist.user.name} />
                  <Field label="Phone" value={order.phlebotomist.user.phone} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not yet assigned.</p>
              )}
            </SectionCard>

            <SectionCard title="Order Status History" icon={History}>
              {!order.statusLogs || order.statusLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status history recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {order.statusLogs.map((log) => (
                    <li key={log.id} className="flex items-start justify-between gap-3 border-b border-dashed border-border pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <StatusBadge tone={statusTone[log.status]}>{statusLabel[log.status]}</StatusBadge>
                        {log.note ? <p className="mt-1 text-xs text-muted-foreground">{log.note}</p> : null}
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p>{formatDate(log.createdAt)}</p>
                        {log.changedBy ? <p className="mt-0.5">by {log.changedBy}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Reports" icon={FileText}>
              <div className="flex flex-wrap items-center gap-2.5">
                {order.reports.length === 0 ? <p className="text-sm text-muted-foreground">No reports uploaded yet.</p> : null}
                {order.reports.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <a href={apiFileUrl(r.fileUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                      Report · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </a>
                    {r.status === "APPROVED" ? (
                      <StatusBadge tone="success">Approved</StatusBadge>
                    ) : (
                      <button
                        type="button"
                        disabled={savingReport}
                        onClick={() => handleApproveReport(r.id)}
                        className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning hover:bg-warning/25"
                      >
                        Approve &amp; release
                      </button>
                    )}
                  </div>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold text-primary hover:bg-primary-soft">
                  <Upload className="h-3.5 w-3.5" /> Upload report (PDF)
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={savingReport}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadReport(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
