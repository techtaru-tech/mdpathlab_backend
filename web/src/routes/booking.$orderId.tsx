import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  Clock,
  Download,
  FileCheck2,
  MapPin,
  Printer,
  RefreshCw,
  User,
  Wallet,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { StatusTimeline } from "@/components/booking/StatusTimeline";
import { apiFileUrl, ApiError, ordersApi, session, type Order } from "@/lib/api";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { payForOrder } from "@/lib/payment";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const title = "Booking Details — MD Path Lab";

export const Route = createFileRoute("/booking/$orderId")({
  // The router's default search parser coerces a numeric-looking value like `?success=1` into
  // the number 1, not the string "1" — accepting both here (rather than just z.string()) avoids
  // an uncaught validation error that would otherwise crash the whole route.
  validateSearch: z.object({ success: z.union([z.string(), z.number(), z.boolean()]).optional() }),
  head: () => ({ meta: [{ title }, { name: "robots", content: "noindex" }] }),
  component: BookingDetailPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "Date to be confirmed";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function BookingDetailPage() {
  const { orderId } = Route.useParams();
  const { success } = Route.useSearch();
  const isAuthed = session.getToken() !== null;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState("");
  const [retrying, setRetrying] = useState(false);

  function load() {
    setLoading(true);
    ordersApi
      .get(orderId)
      .then(setOrder)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this booking"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, orderId]);

  async function handleCancel() {
    setCancelling(true);
    setActionError("");
    try {
      await ordersApi.cancel(orderId, cancelReason.trim() || undefined);
      setCancelOpen(false);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't cancel this booking");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetryPayment() {
    if (!order) return;
    setRetrying(true);
    setActionError("");
    const outcome = await payForOrder(order);
    setRetrying(false);
    if (outcome.status === "success") {
      load();
    } else if (outcome.status === "cancelled") {
      setActionError("Payment was cancelled — you can retry anytime before your slot.");
    } else if (outcome.status === "failed") {
      setActionError(`Payment failed — ${outcome.message}`);
    } else {
      setActionError(outcome.message);
    }
  }

  if (!isAuthed) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md">
          <div className="surface-card p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to view this booking</h1>
            <Link to="/login" search={{ redirect: `/booking/${orderId}` }} className="mt-6 block">
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center text-sm text-muted-foreground">Loading booking…</div>
      </section>
    );
  }

  if (loadError || !order) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-destructive">{loadError || "Booking not found"}</p>
          <Link to="/dashboard" className="mt-6 block">
            <ActionButton variant="outline" size="md" className="w-full">
              Back to My Bookings
            </ActionButton>
          </Link>
        </div>
      </section>
    );
  }

  const canCancel = order.status !== "CANCELLED" && order.status !== "REPORT_READY";
  const canRetryPayment = order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID" && order.status !== "CANCELLED";
  const isRefundEligible = order.status === "CANCELLED" && order.paymentStatus === "PAID";

  return (
    <section className="py-10 lg:py-14 print:py-4">
      <div className="container-page">
        {success ? (
          <div className="surface-card mb-6 flex items-center gap-4 border border-success/20 bg-success-soft p-6 print:hidden">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-success">Booking confirmed!</h1>
              <p className="text-sm text-success/80">
                {order.paymentMethod === "COD" ? "Pay on collection." : "Your payment was successful."} We'll see you at your slot.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Booking ID</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{order.orderNumber}</h1>
          </div>
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold uppercase", ORDER_STATUS_META[order.status].tint)}>
            {ORDER_STATUS_META[order.status].label}
          </span>
        </div>

        {actionError ? (
          <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive print:hidden">{actionError}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-6">
            <div className="surface-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Items</h2>
              <div className="mt-3 space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 border-b border-dashed border-border pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{item.itemName}</p>
                      {item.familyMember ? (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {item.familyMember.name} ({item.familyMember.relation})
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-bold">₹{item.price}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Collection details</h2>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2">
                  {order.collectionType === "HOME" ? <MapPin className="h-4 w-4 shrink-0 text-primary" /> : <Building2 className="h-4 w-4 shrink-0 text-primary" />}
                  {order.collectionType === "HOME"
                    ? order.address
                      ? `${order.address.line1}, ${order.address.city} ${order.address.pincode}`
                      : "Home collection"
                    : order.collectionCenter
                      ? `${order.collectionCenter.name} — ${order.collectionCenter.address}`
                      : "Collection centre visit"}
                </p>
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-primary" /> {formatDate(order.scheduledDate)}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-primary" /> {order.slot?.label ?? "Slot to be confirmed"}
                </p>
                <p className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 shrink-0 text-primary" /> {order.paymentMethod === "COD" ? "Pay after collection" : "Paid online"}
                </p>
              </div>
              {order.phlebotomist ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-primary-soft p-3 text-xs font-bold text-primary">
                  <User className="h-3.5 w-3.5" /> Phlebotomist assigned: {order.phlebotomist.user.name ?? order.phlebotomist.user.phone}
                </p>
              ) : null}
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Tracking</h2>
              <div className="mt-4">
                <StatusTimeline status={order.status} />
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Reports</h2>
              {order.reports.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No reports yet — they'll show up here once a sample has been collected and processed.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {order.reports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
                      <span className="flex items-center gap-2 text-sm font-bold">
                        <FileCheck2 className="h-4 w-4 text-success" /> Report ready
                      </span>
                      <a
                        href={apiFileUrl(r.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {order.status === "CANCELLED" ? (
              <div className="surface-card p-6">
                <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Refund</h2>
                {isRefundEligible ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    This booking was paid and later cancelled. Refunds are processed to your original payment method
                    within 3–5 working days. Detailed refund tracking (pending/processing/completed) isn't available in
                    the app yet — contact support for the latest status.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No payment was collected for this booking, so no refund applies.</p>
                )}
              </div>
            ) : null}
          </div>

          <aside className="w-full space-y-4 lg:sticky lg:top-24 lg:w-[340px] lg:shrink-0 print:hidden">
            <div className="surface-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Amount</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>₹{order.subtotal}</span></div>
                {order.discount > 0 ? (
                  <div className="flex justify-between text-success"><span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><span>-₹{order.discount}</span></div>
                ) : null}
                <div className="flex justify-between text-muted-foreground"><span>Collection fee</span><span>{order.collectionFee === 0 ? "FREE" : `₹${order.collectionFee}`}</span></div>
                <div className="flex justify-between border-t border-dashed border-border pt-2 text-base font-extrabold"><span>Total</span><span className="text-primary">₹{order.total}</span></div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {canRetryPayment ? (
                <ActionButton variant="primary" size="md" className="w-full" onClick={handleRetryPayment} disabled={retrying}>
                  <RefreshCw className="h-4 w-4" /> {retrying ? "Opening payment…" : "Retry payment"}
                </ActionButton>
              ) : null}
              <Link to="/dashboard">
                <ActionButton variant="outline" size="md" className="w-full">
                  My Bookings
                </ActionButton>
              </Link>
              <Link to="/tests">
                <ActionButton variant="outline" size="md" className="w-full">
                  Continue Shopping
                </ActionButton>
              </Link>
              <ActionButton variant="outline" size="md" className="w-full" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / Save summary
              </ActionButton>
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold text-destructive hover:underline"
                >
                  <X className="h-3.5 w-3.5" /> Cancel booking
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-bold text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Need to change date, time or address?
              </p>
              <p className="mt-1.5">
                Editing an existing booking isn't available yet — this requires a backend update we haven't shipped.
                For now, please cancel (if within the free-cancellation window) and rebook, or call support.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Free cancellation applies up to 2 hours before your slot. This can't be undone.
          </p>
          <label className="mt-2 block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Reason (optional)
            </span>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Rescheduling for a later date"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none"
            />
          </label>
          <DialogFooter>
            <ActionButton type="button" variant="outline" size="md" onClick={() => setCancelOpen(false)}>
              Keep booking
            </ActionButton>
            <ActionButton type="button" variant="primary" size="md" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Yes, cancel booking"}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
