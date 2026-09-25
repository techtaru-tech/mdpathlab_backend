import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, MapPin, Phone, User } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError } from "@/lib/api";
import {
  phlebotomistOrdersApi,
  type PhlebotomistOrderDetail,
  type PhlebotomistSampleRow,
} from "@/lib/phlebotomist-api";

export const Route = createFileRoute("/phlebotomist/orders/$id")({
  head: () => ({ meta: [{ title: "Assignment — Phlebotomist" }, { name: "robots", content: "noindex" }] }),
  component: PhlebotomistOrderDetailPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "Today";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function PhlebotomistOrderDetailPage() {
  const { id } = Route.useParams();

  const [order, setOrder] = useState<PhlebotomistOrderDetail | null>(null);
  const [samples, setSamples] = useState<PhlebotomistSampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
  const [barcode, setBarcode] = useState("");

  function load() {
    setLoading(true);
    Promise.all([phlebotomistOrdersApi.get(id), phlebotomistOrdersApi.listSamples(id)])
      .then(([o, s]) => {
        setOrder(o);
        setSamples(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this assignment"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSampleCollected(orderItemId: string, collected: boolean) {
    setError("");
    try {
      const updated = await phlebotomistOrdersApi.updateSample(id, orderItemId, { collected });
      setSamples((prev) => prev.map((s) => (s.orderItemId === orderItemId ? { ...s, sample: updated } : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update this sample");
    }
  }

  async function updateSampleField(orderItemId: string, field: "tubeType" | "quantity" | "label", value: string) {
    setSamples((prev) => prev.map((s) => (s.orderItemId === orderItemId ? { ...s, sample: { ...s.sample, orderItemId, [field]: value } as any } : s)));
    try {
      const updated = await phlebotomistOrdersApi.updateSample(id, orderItemId, { [field]: value });
      setSamples((prev) => prev.map((s) => (s.orderItemId === orderItemId ? { ...s, sample: updated } : s)));
    } catch {
      // best-effort — the next explicit collect toggle will surface a real error if it matters
    }
  }

  if (loading) {
    return (
      <section className="min-h-screen bg-muted/40 py-6">
        <div className="container-page mx-auto max-w-lg">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="min-h-screen bg-muted/40 py-6">
        <div className="container-page mx-auto max-w-lg">
          <p className="text-sm font-semibold text-destructive">{error || "Assignment not found"}</p>
        </div>
      </section>
    );
  }

  const allCollected = samples.length > 0 && samples.every((s) => s.sample?.collectedAt);
  // Orders assigned before this accept/reject step existed have no assignmentStatus at all —
  // treat that the same as already-accepted so an old booking isn't stuck with no visible action.
  const effectivelyAccepted = order.assignmentStatus === "ACCEPTED" || order.assignmentStatus === null;

  return (
    <section className="min-h-screen bg-muted/40 py-6">
      <div className="container-page mx-auto max-w-lg">
        <Link to="/phlebotomist" className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Today's assignments
        </Link>

        <div className="surface-card mt-3 p-5">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{order.orderNumber}</p>
          <h1 className="mt-1 flex items-center gap-2 text-lg font-extrabold">
            <User className="h-4.5 w-4.5 text-primary" /> {order.user.name ?? order.user.phone}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary" /> {order.user.phone}
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {order.address ? `${order.address.line1}${order.address.landmark ? `, near ${order.address.landmark}` : ""}, ${order.address.city} ${order.address.pincode}` : "No address"}
          </p>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {formatDate(order.scheduledDate)} · {order.slot?.label ?? "—"} · {order.paymentMethod === "COD" ? "Pay at collection" : "Paid online"}
          </p>

          <div className="mt-4 divide-y divide-border border-t border-border pt-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {item.itemName}
                  {item.familyMember ? <span className="text-muted-foreground"> — {item.familyMember.name}</span> : null}
                </span>
                <span className="font-bold">₹{item.price}</span>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}

        {/* Step 1: Accept / Reject */}
        {order.assignmentStatus === "PENDING" ? (
          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-extrabold">Respond to this assignment</h2>
            {!showReject ? (
              <div className="mt-3 flex gap-3">
                <ActionButton variant="primary" size="md" className="flex-1" disabled={busy} onClick={() => run(() => phlebotomistOrdersApi.accept(id))}>
                  Accept
                </ActionButton>
                <ActionButton variant="outline" size="md" className="flex-1" disabled={busy} onClick={() => setShowReject(true)}>
                  Reject
                </ActionButton>
              </div>
            ) : (
              <div className="mt-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm focus:border-primary/40 focus:outline-none"
                />
                <div className="mt-3 flex gap-3">
                  <ActionButton
                    variant="primary"
                    size="md"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => run(() => phlebotomistOrdersApi.reject(id, rejectReason.trim() || undefined))}
                  >
                    Confirm reject
                  </ActionButton>
                  <ActionButton variant="outline" size="md" className="flex-1" onClick={() => setShowReject(false)}>
                    Cancel
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Step 2: On the way */}
        {effectivelyAccepted && !order.onTheWayAt ? (
          <div className="surface-card mt-4 p-5">
            <ActionButton variant="primary" size="md" className="w-full" disabled={busy} onClick={() => run(() => phlebotomistOrdersApi.onTheWay(id))}>
              Mark "On the Way"
            </ActionButton>
          </div>
        ) : null}

        {/* Step 3: Arrived */}
        {effectivelyAccepted && order.onTheWayAt && !order.reachedAt ? (
          <div className="surface-card mt-4 p-5">
            <ActionButton variant="primary" size="md" className="w-full" disabled={busy} onClick={() => run(() => phlebotomistOrdersApi.markReached(id))}>
              Mark "Arrived"
            </ActionButton>
          </div>
        ) : null}

        {/* Step 4: OTP verification */}
        {order.reachedAt && !order.collectionOtpVerifiedAt ? (
          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-extrabold">Verify patient</h2>
            <p className="mt-1 text-xs text-muted-foreground">Ask the patient for the code sent to their phone.</p>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="4-digit code"
              className="mt-3 h-11 w-full rounded-xl border border-border bg-muted px-3.5 text-center text-lg font-extrabold tracking-widest focus:border-primary/40 focus:outline-none"
            />
            <ActionButton
              variant="primary"
              size="md"
              className="mt-3 w-full"
              disabled={busy || otpCode.length !== 4}
              onClick={() => run(() => phlebotomistOrdersApi.verifyOtp(id, otpCode))}
            >
              Verify
            </ActionButton>
          </div>
        ) : null}

        {/* Step 5: Sample details + collect */}
        {order.collectionOtpVerifiedAt && order.phlebotomistStatus === "Pending" ? (
          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-extrabold">Sample details</h2>
            <div className="mt-3 space-y-3">
              {samples.map((s) => (
                <div key={s.orderItemId} className="rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">{s.itemName}</p>
                    <label className="flex items-center gap-1.5 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(s.sample?.collectedAt)}
                        onChange={(e) => toggleSampleCollected(s.orderItemId, e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Collected
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      defaultValue={s.sample?.tubeType ?? ""}
                      onBlur={(e) => updateSampleField(s.orderItemId, "tubeType", e.target.value)}
                      placeholder="Tube type"
                      className="h-9 rounded-lg border border-border bg-card px-2 text-xs focus:outline-none"
                    />
                    <input
                      defaultValue={s.sample?.quantity ?? ""}
                      onBlur={(e) => updateSampleField(s.orderItemId, "quantity", e.target.value)}
                      placeholder="Quantity"
                      className="h-9 rounded-lg border border-border bg-card px-2 text-xs focus:outline-none"
                    />
                    <input
                      defaultValue={s.sample?.label ?? ""}
                      onBlur={(e) => updateSampleField(s.orderItemId, "label", e.target.value)}
                      placeholder="Label id"
                      className="h-9 rounded-lg border border-border bg-card px-2 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            <ActionButton
              variant="primary"
              size="md"
              className="mt-4 w-full"
              disabled={busy || !allCollected}
              onClick={() => run(() => phlebotomistOrdersApi.markSampleCollected(id))}
            >
              Mark "Sample Collected"
            </ActionButton>
            {!allCollected ? <p className="mt-2 text-center text-xs text-muted-foreground">Mark every sample above collected first.</p> : null}
          </div>
        ) : null}

        {/* Step 6: Payment (COD only) */}
        {order.phlebotomistStatus === "Collected" && order.paymentMethod === "COD" && order.collectedAmount === null ? (
          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-extrabold">Collect payment</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Amount collected"
                className="h-11 flex-1 rounded-xl border border-border bg-muted px-3.5 text-sm focus:border-primary/40 focus:outline-none"
              />
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as "CASH" | "UPI")}
                className="h-11 rounded-xl border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            <ActionButton
              variant="primary"
              size="md"
              className="mt-3 w-full"
              disabled={busy || !paymentAmount}
              onClick={() => run(() => phlebotomistOrdersApi.collectPayment(id, Number(paymentAmount), paymentMode))}
            >
              Record payment
            </ActionButton>
          </div>
        ) : null}

        {/* Step 7: Handover to lab */}
        {order.phlebotomistStatus === "Collected" && (order.paymentMethod !== "COD" || order.collectedAmount !== null) && !order.handedOverAt ? (
          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-extrabold">Handover to lab</h2>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Sample barcode"
              className="mt-3 h-11 w-full rounded-xl border border-border bg-muted px-3.5 text-sm focus:border-primary/40 focus:outline-none"
            />
            <ActionButton
              variant="primary"
              size="md"
              className="mt-3 w-full"
              disabled={busy || !barcode.trim()}
              onClick={() => run(() => phlebotomistOrdersApi.handover(id, barcode.trim()))}
            >
              Mark "Handed Over to Lab"
            </ActionButton>
          </div>
        ) : null}

        {order.handedOverAt ? (
          <div className="surface-card mt-4 flex items-center gap-3 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success-soft text-success">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-sm font-bold">Collection complete — handed over to the lab.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
