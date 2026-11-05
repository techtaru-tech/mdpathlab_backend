import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { addressLine, inputClass, NewAddressForm, SlotPicker, TestPicker, type PickedTest } from "@/components/admin/booking/BookingFormParts";
import {
  AdminApiError,
  adminCollectionCentersApi,
  adminOrdersApi,
  adminPatientsApi,
  type AdminCollectionCenter,
  type AdminEditBookingInput,
  type AdminOrder,
  type AdminPatientDetail,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const sameTests = (a: PickedTest[], b: PickedTest[]) => [...a.map((t) => t.key)].sort().join("|") === [...b.map((t) => t.key)].sort().join("|");

/**
 * Change a booking that has not been collected yet: the visit (date, slot, address or centre) and the tests.
 * The server re-checks everything the way checkout does and explains anything it refuses.
 */
export function EditBookingDialog({ order, onClose, onSaved }: { order: AdminOrder; onClose: () => void; onSaved: (summary: string) => void }) {
  const initialTests: PickedTest[] = order.items.map((i) => ({
    key: `${i.itemType}:${i.itemId}:${i.familyMemberId ?? ""}`,
    itemType: i.itemType,
    itemId: i.itemId,
    name: i.itemName,
    price: i.price,
    familyMemberId: i.familyMemberId,
  }));
  const initialDate = order.scheduledDate ? order.scheduledDate.slice(0, 10) : "";
  const initialSlot = order.slot?.id ?? "";
  const initialAddress = order.address?.id ?? "";
  const initialCentre = order.collectionCenterId ?? "";

  const [date, setDate] = useState(initialDate);
  const [slotId, setSlotId] = useState(initialSlot);
  const [addressId, setAddressId] = useState(initialAddress);
  const [centreId, setCentreId] = useState(initialCentre);
  const [tests, setTests] = useState<PickedTest[]>(initialTests);
  const [note, setNote] = useState("");
  const [patient, setPatient] = useState<AdminPatientDetail | null>(null);
  const [centres, setCentres] = useState<AdminCollectionCenter[]>([]);
  const [addingAddress, setAddingAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasAddress = order.collectionType === "HOME" || Boolean(order.address);
  useEffect(() => {
    if (hasAddress) adminPatientsApi.get(order.user.id).then(setPatient).catch(() => setPatient(null));
    if (order.collectionType === "CENTER") {
      adminCollectionCentersApi
        .list()
        .then((c) => setCentres(c.filter((x) => x.status === "ACTIVE" || x.id === initialCentre)))
        .catch(() => setCentres([]));
    }
  }, [order.user.id, order.collectionType, hasAddress, initialCentre]);

  const scheduleChanged = date !== initialDate || slotId !== initialSlot;
  const addressChanged = addressId !== initialAddress;
  const centreChanged = centreId !== initialCentre;
  const testsChanged = !sameTests(tests, initialTests);
  const changed = scheduleChanged || addressChanged || centreChanged || testsChanged;
  const visitMoves = scheduleChanged || addressChanged || centreChanged;
  const newSubtotal = tests.reduce((s, t) => s + t.price, 0);

  async function save() {
    if (scheduleChanged && !slotId) return setError("Choose a slot for the new date");
    if (tests.length === 0) return setError("A booking needs at least one test");
    const dto: AdminEditBookingInput = {
      ...(scheduleChanged ? { scheduledDate: date, slotId } : {}),
      ...(addressChanged ? { addressId } : {}),
      ...(centreChanged ? { collectionCenterId: centreId } : {}),
      ...(testsChanged
        ? { items: tests.map((t) => ({ itemType: t.itemType, itemId: t.itemId, ...(t.familyMemberId ? { familyMemberId: t.familyMemberId } : {}) })) }
        : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    setSaving(true);
    setError("");
    try {
      const res = await adminOrdersApi.edit(order.id, dto);
      onSaved(res.editSummary);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save the changes");
      setSaving(false);
    }
  }

  const liveAddresses = patient?.addresses.filter((a) => !a.deletedAt || a.id === initialAddress) ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold">Edit booking {order.orderNumber}</h2>
            <p className="text-xs text-muted-foreground">
              {order.user.name || order.user.phone} · the patient is told about the change. Tests already on the booking keep the price they were booked at.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="mt-5 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Date &amp; slot</h3>
        <div className="mt-2">
          <SlotPicker
            date={date}
            slotId={slotId}
            collectionType={order.collectionType}
            collectionCenterId={order.collectionType === "CENTER" ? centreId || undefined : undefined}
            onChange={(d, s) => {
              setDate(d);
              setSlotId(s);
            }}
          />
        </div>

        {hasAddress ? (
          <>
            <h3 className="mt-5 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Address</h3>
            <div className="mt-2 space-y-2">
              {!patient ? <p className="text-xs text-muted-foreground">Loading the patient's addresses…</p> : null}
              {liveAddresses.map((a) => (
                <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", addressId === a.id ? "border-primary bg-primary-soft" : "border-border")}>
                  <input type="radio" name="edit-address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1" />
                  <span>
                    {a.label ? <span className="font-bold">{a.label} · </span> : null}
                    {addressLine(a)}
                  </span>
                </label>
              ))}
              {patient ? (
                addingAddress ? (
                  <NewAddressForm
                    patientId={patient.id}
                    onCancel={() => setAddingAddress(false)}
                    onSaved={(a) => {
                      setPatient((p) => (p ? { ...p, addresses: [...p.addresses, a] } : p));
                      setAddressId(a.id);
                      setAddingAddress(false);
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setAddingAddress(true)} className="text-xs font-bold text-primary hover:underline">
                    + Add a new address
                  </button>
                )
              ) : null}
            </div>
          </>
        ) : null}

        {order.collectionType === "CENTER" ? (
          <>
            <h3 className="mt-5 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Collection centre</h3>
            <select
              value={centreId}
              onChange={(e) => {
                setCentreId(e.target.value);
                setSlotId("");
              }}
              className={cn(inputClass, "mt-2")}
            >
              {centres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.address}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <h3 className="mt-5 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Tests</h3>
        <div className="mt-2">
          <TestPicker value={tests} onChange={setTests} />
          {testsChanged ? (
            <p className="mt-2 text-right text-xs font-semibold">
              Tests now ₹{newSubtotal} (was ₹{initialTests.reduce((s, t) => s + t.price, 0)}) — coupon and collection fee are worked out again when you save.
            </p>
          ) : null}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for the change (optional) — kept in the booking history"
          rows={2}
          maxLength={300}
          className="mt-5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
        />

        {visitMoves && order.phlebotomist ? (
          <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs font-semibold text-warning">
            Moving the visit takes it off {order.phlebotomist.user.name || "the phlebotomist"}'s list — assign a phlebotomist again after saving.
          </p>
        ) : null}
        {testsChanged && order.paymentStatus === "PAID" ? (
          <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs font-semibold text-warning">
            This booking is already paid, so the tests can only change if the total stays the same.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!changed || saving}
            onClick={save}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
