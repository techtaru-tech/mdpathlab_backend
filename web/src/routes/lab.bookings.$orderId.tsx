import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  LabApiError,
  labOrdersApi,
  labResultsApi,
  type AvailablePhlebotomist,
  type LabOrder,
  type LabResultRow,
} from "@/lib/lab-api";
import { ORDER_STATUS_META } from "@/lib/orderStatus";

export const Route = createFileRoute("/lab/bookings/$orderId")({
  head: () => ({ meta: [{ title: "Booking — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabBookingDetailPage,
});

const STATUS_OPTIONS = ["CONFIRMED", "PHLEBOTOMIST_ASSIGNED", "SAMPLE_COLLECTED", "IN_LAB", "CANCELLED"] as const;

function formatDate(iso: string | null) {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LabBookingDetailPage() {
  const { orderId } = Route.useParams();

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [phlebotomists, setPhlebotomists] = useState<AvailablePhlebotomist[]>([]);
  const [results, setResults] = useState<LabResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nextStatus, setNextStatus] = useState<string>("");
  const [phlebotomistId, setPhlebotomistId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [resultDrafts, setResultDrafts] = useState<Record<string, { value: string; unit: string }>>({});
  const [savingParameterId, setSavingParameterId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([labOrdersApi.get(orderId), labOrdersApi.availablePhlebotomists(orderId)])
      .then(([o, phlebos]) => {
        setOrder(o);
        setPhlebotomists(phlebos);
        setNextStatus(o.status);
        setPhlebotomistId(o.phlebotomist?.id ?? "");
      })
      .catch((err) => setError(err instanceof LabApiError ? err.message : "Couldn't load this booking"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (order && order.status !== "PENDING_PAYMENT" && order.status !== "CONFIRMED") {
      labResultsApi.list(orderId).then((rows) => {
        setResults(rows);
        setResultDrafts(Object.fromEntries(rows.map((r) => [r.parameterId, { value: r.value ?? "", unit: r.unit ?? "" }])));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status]);

  async function handleUpdate() {
    if (!order) return;
    setSaving(true);
    setError("");
    try {
      const updated = await labOrdersApi.updateStatus(order.id, {
        status: nextStatus,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(phlebotomistId ? { phlebotomistId } : {}),
      });
      setOrder(updated);
      setNote("");
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't update this booking");
    } finally {
      setSaving(false);
    }
  }

  async function saveResult(parameterId: string) {
    const draft = resultDrafts[parameterId];
    if (!draft?.value.trim()) return;
    setSavingParameterId(parameterId);
    try {
      await labResultsApi.upsert(orderId, { parameterId, value: draft.value.trim(), ...(draft.unit.trim() ? { unit: draft.unit.trim() } : {}) });
      setResults((prev) => prev.map((r) => (r.parameterId === parameterId ? { ...r, value: draft.value, unit: draft.unit || null, enteredAt: new Date().toISOString() } : r)));
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't save this value");
    } finally {
      setSavingParameterId(null);
    }
  }

  if (loading) {
    return (
      <LabLayout activePath="/lab/bookings">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </LabLayout>
    );
  }

  if (!order) {
    return (
      <LabLayout activePath="/lab/bookings">
        <p className="text-sm font-semibold text-destructive">{error || "Booking not found"}</p>
      </LabLayout>
    );
  }

  const canEnterResults = order.status === "SAMPLE_COLLECTED" || order.status === "IN_LAB";

  return (
    <LabLayout activePath="/lab/bookings">
      <Link to="/lab/bookings" className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Booking</p>
          <h1 className="text-2xl font-extrabold">{order.orderNumber}</h1>
        </div>
        <StatusBadge tone={order.status === "CANCELLED" ? "danger" : order.status === "REPORT_READY" ? "success" : "primary"}>
          {ORDER_STATUS_META[order.status].label}
        </StatusBadge>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Items</h2>
            <div className="mt-3 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>{item.itemName}</span>
                  <span className="font-semibold">₹{item.price}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Collection details</h2>
            <p className="mt-3 text-sm">
              {order.address ? `${order.address.line1}, ${order.address.city} ${order.address.pincode}` : "Collection center visit"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(order.scheduledDate)} · {order.slot?.label ?? "Slot not set"}
            </p>
          </div>

          {order.handedOverAt ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Sample handover</h2>
              <p className="mt-2 text-sm">
                Handed over by phlebotomist on {formatDate(order.handedOverAt)}
                {order.sampleBarcode ? ` — barcode ${order.sampleBarcode}` : ""}
              </p>
              {order.sampleReceivedAt ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-success">
                  <Check className="h-4 w-4" /> Received at lab on {formatDate(order.sampleReceivedAt)}
                </p>
              ) : (
                <ActionButton
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  disabled={savingParameterId !== null}
                  onClick={async () => {
                    try {
                      const updated = await labOrdersApi.receiveSample(order.id);
                      setOrder(updated);
                    } catch (err) {
                      setError(err instanceof LabApiError ? err.message : "Couldn't mark this sample received");
                    }
                  }}
                >
                  Mark "Sample Received"
                </ActionButton>
              )}
            </div>
          ) : null}

          {canEnterResults ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Result values</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the raw value for each parameter — MD Path Lab admin generates and approves the final report from these.
              </p>
              {results.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No parameters found for this booking.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {results.map((r) => (
                    <div key={r.parameterId} className="grid grid-cols-[1.2fr_1fr_0.7fr_auto] items-center gap-2">
                      <span className="text-sm font-semibold">{r.name}</span>
                      <input
                        value={resultDrafts[r.parameterId]?.value ?? ""}
                        onChange={(e) => setResultDrafts((prev) => ({ ...prev, [r.parameterId]: { ...prev[r.parameterId], value: e.target.value, unit: prev[r.parameterId]?.unit ?? "" } }))}
                        placeholder="Value"
                        className="h-10 rounded-lg border border-border bg-muted px-2.5 text-sm focus:outline-none"
                      />
                      <input
                        value={resultDrafts[r.parameterId]?.unit ?? ""}
                        onChange={(e) => setResultDrafts((prev) => ({ ...prev, [r.parameterId]: { value: prev[r.parameterId]?.value ?? "", unit: e.target.value } }))}
                        placeholder="Unit"
                        className="h-10 rounded-lg border border-border bg-muted px-2.5 text-sm focus:outline-none"
                      />
                      <ActionButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => saveResult(r.parameterId)}
                        disabled={savingParameterId === r.parameterId || !resultDrafts[r.parameterId]?.value.trim()}
                      >
                        {r.enteredAt ? <Check className="h-3.5 w-3.5" /> : "Save"}
                      </ActionButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Update booking</h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Status</span>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value)}
                disabled={order.status === "CANCELLED"}
                className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none disabled:opacity-60"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>

            {order.collectionType === "HOME" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Phlebotomist</span>
                <select
                  value={phlebotomistId}
                  onChange={(e) => setPhlebotomistId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {phlebotomists.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.available && p.id !== order.phlebotomist?.id}>
                      {p.available ? "✓" : "✗"} {p.name ?? p.phone} ({p.employeeCode})
                      {!p.available ? ` — ${p.reason}` : ""}
                    </option>
                  ))}
                </select>
                {phlebotomistId && phlebotomists.find((p) => p.id === phlebotomistId)?.available === false ? (
                  <p className="mt-1.5 text-xs font-semibold text-destructive">
                    {phlebotomists.find((p) => p.id === phlebotomistId)?.reason}
                  </p>
                ) : null}
              </label>
            ) : null}

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-muted p-2.5 text-sm focus:outline-none"
              />
            </label>

            <ActionButton type="button" variant="primary" size="sm" className="mt-3 w-full" onClick={handleUpdate} disabled={saving || order.status === "CANCELLED"}>
              {saving ? "Saving…" : "Save"}
            </ActionButton>
          </div>

          {order.statusLogs.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">History</h2>
              <div className="mt-3 space-y-2 text-xs">
                {order.statusLogs.map((log, i) => (
                  <div key={i} className="border-b border-dashed border-border pb-2 last:border-0">
                    <p className="font-semibold">{ORDER_STATUS_META[log.status as keyof typeof ORDER_STATUS_META]?.label ?? log.status}</p>
                    <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("en-IN")}</p>
                    {log.note ? <p className="mt-0.5 text-muted-foreground">{log.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </LabLayout>
  );
}
