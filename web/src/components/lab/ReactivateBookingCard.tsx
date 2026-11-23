import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { slotsApi, type Slot } from "@/lib/api";
import { LabApiError, labOrdersApi, type LabOrder } from "@/lib/lab-api";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Shown on a cancelled booking: after the team has spoken to the patient, the lab picks a new date and slot and the
 * booking comes back confirmed (no phlebotomist yet — assign one from "Update booking" as usual).
 */
export function ReactivateBookingCard({ order, onReactivated }: { order: LabOrder; onReactivated: (o: LabOrder) => void }) {
  const [date, setDate] = useState(todayIst());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setSlotId("");
    slotsApi
      .list({ date, collectionType: order.collectionType, ...(order.collectionCenterId ? { collectionCenterId: order.collectionCenterId } : {}) })
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [date, order.collectionType, order.collectionCenterId]);

  async function submit() {
    if (!slotId) return;
    if (!window.confirm(`Reactivate booking ${order.orderNumber} for ${date}?\n\nOnly do this after the patient has agreed. They will get a message that the booking is active again.`)) return;
    setSaving(true);
    setError("");
    try {
      const updated = await labOrdersApi.reactivate(order.id, { scheduledDate: date, slotId, ...(note.trim() ? { note: note.trim() } : {}) });
      const r = updated.reactivation;
      const extras = [
        r?.walletDebited ? `₹${r.walletDebited} was taken from the patient's wallet again.` : "",
        r?.movedToCollection ? `The patient had spent the wallet refund — collect ₹${r.movedToCollection} more at the visit.` : "",
        r?.switchedToCod ? "The online payment was never made, so this is now pay on collection." : "",
      ].filter(Boolean);
      if (extras.length) window.alert("Booking reactivated.\n\n" + extras.join("\n"));
      onReactivated(updated);
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't reactivate this booking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
        <RotateCcw className="h-4 w-4" /> Reactivate booking
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">If the patient wants this booking back, choose a new date and time slot.</p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Date</span>
        <input
          type="date"
          value={date}
          min={todayIst()}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Time slot</span>
        <select
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          disabled={loadingSlots}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none disabled:opacity-60"
        >
          <option value="">{loadingSlots ? "Loading…" : slots.some((s) => s.available) ? "Choose a slot" : "No slot free on this date"}</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.available}>
              {s.label}
              {s.isPast ? " — passed" : !s.available ? " — full" : s.remainingCapacity !== null ? ` — ${s.remainingCapacity} left` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-muted-foreground uppercase">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Patient called and asked to book again"
          className="w-full rounded-lg border border-border bg-muted p-2.5 text-sm focus:outline-none"
        />
      </label>

      {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}

      <ActionButton type="button" variant="primary" size="sm" className="mt-3 w-full" onClick={submit} disabled={saving || !slotId}>
        {saving ? "Reactivating…" : "Reactivate booking"}
      </ActionButton>
    </div>
  );
}
