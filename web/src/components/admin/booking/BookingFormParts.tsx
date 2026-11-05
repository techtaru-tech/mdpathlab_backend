import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  AdminApiError,
  adminHomeVisitsApi,
  adminPatientsApi,
  type AdminAddressInput,
  type AdminPatientAddress,
  type HomeVisitCatalogueItem,
} from "@/lib/admin-api";
import { slotsApi, type Slot } from "@/lib/api";
import { cn } from "@/lib/utils";

/** A test or package on a booking being made or edited; `price` is what it costs (or was booked at). */
export type PickedTest = {
  key: string;
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE" | "RADIOLOGY";
  itemId: string;
  name: string;
  price: number;
  familyMemberId?: string | null;
};

export const inputClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none";

/** Today's date in India, whatever the browser's own time zone. */
export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Search the catalogue and build the list of tests for a booking. */
export function TestPicker({ value, onChange }: { value: PickedTest[]; onChange: (tests: PickedTest[]) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<HomeVisitCatalogueItem[]>([]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      adminHomeVisitsApi
        .searchCatalogue(search.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search a test or package (min 2 letters)"
        className={inputClass}
      />
      {results.length > 0 ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
          {results.map((r) => {
            const already = value.some((p) => p.itemType === r.itemType && p.itemId === r.id && !p.familyMemberId);
            return (
              <button
                key={`${r.itemType}:${r.id}`}
                type="button"
                disabled={already}
                onClick={() => {
                  onChange([...value, { key: `${r.itemType}:${r.id}:`, itemType: r.itemType, itemId: r.id, name: r.title, price: r.price }]);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 truncate">
                  {r.title}{" "}
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{r.itemType === "PACKAGE" ? "Package" : "Test"}</span>
                </span>
                <span className="shrink-0 font-bold">{already ? "Added" : `₹${r.price}`}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {value.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tests added yet.</p>
        ) : (
          value.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-semibold">{p.name}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-bold">₹{p.price}</span>
                <button type="button" onClick={() => onChange(value.filter((x) => x.key !== p.key))} aria-label={`Remove ${p.name}`}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** A visit date and one of that day's slots, with live availability for the collection type (and centre). */
export function SlotPicker({
  date,
  slotId,
  collectionType,
  collectionCenterId,
  onChange,
}: {
  date: string;
  slotId: string;
  collectionType: "HOME" | "CENTER";
  collectionCenterId?: string | undefined;
  onChange: (date: string, slotId: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState("");
  const needsCentre = collectionType === "CENTER" && !collectionCenterId;

  useEffect(() => {
    if (!date || needsCentre) {
      setSlots(null);
      return;
    }
    let current = true;
    setSlots(null);
    setError("");
    slotsApi
      .list({ date, collectionType, ...(collectionCenterId ? { collectionCenterId } : {}) })
      .then((s) => current && setSlots(s))
      .catch(() => current && setError("Couldn't load slots for this date"));
    return () => {
      current = false;
    };
  }, [date, collectionType, collectionCenterId, needsCentre]);

  return (
    <div>
      <input type="date" value={date} min={todayIst()} onChange={(e) => onChange(e.target.value, "")} className={cn(inputClass, "sm:w-52")} />
      <div className="mt-3 flex flex-wrap gap-2">
        {needsCentre ? (
          <p className="text-xs text-muted-foreground">Choose the collection centre first.</p>
        ) : error ? (
          <p className="text-xs font-semibold text-destructive">{error}</p>
        ) : slots === null ? (
          <p className="text-xs text-muted-foreground">{date ? "Loading slots…" : "Choose a date."}</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No slots on this date.</p>
        ) : (
          slots.map((s) => {
            // The booking's current slot stays selectable even if it now shows as full (it is this booking's own place).
            const disabled = !s.available && s.id !== slotId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(date, s.id)}
                title={disabled ? (s.isPast ? "This slot has already passed" : "Fully booked") : undefined}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                  s.id === slotId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {s.label}
                {s.remainingCapacity !== null && s.available ? <span className="ml-1 font-normal opacity-80">({s.remainingCapacity} left)</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function addressLine(a: { houseNo: string | null; line1: string; landmark: string | null; city: string; pincode: string }) {
  return [a.houseNo, a.line1, a.landmark, a.city, a.pincode].filter(Boolean).join(", ");
}

/** A new address for the patient, saved to their account straight away (they will see it in their app too). */
export function NewAddressForm({
  patientId,
  onSaved,
  onCancel,
}: {
  patientId: string;
  onSaved: (address: AdminPatientAddress) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ houseNo: "", line1: "", landmark: "", city: "", state: "", pincode: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (form.line1.trim().length < 5) return setError("Enter the street / area (at least 5 letters)");
    if (!form.city.trim()) return setError("Enter the city");
    if (!/^\d{6}$/.test(form.pincode.trim())) return setError("Enter a 6-digit pincode");
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone.trim())) return setError("Enter a valid 10-digit mobile number, or leave it empty");
    setSaving(true);
    setError("");
    try {
      const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) as AdminAddressInput;
      onSaved(await adminPatientsApi.addAddress(patientId, trimmed));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save the address");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input value={form.houseNo} onChange={set("houseNo")} placeholder="House / flat no." className={inputClass} />
        <input value={form.line1} onChange={set("line1")} placeholder="Street, area *" className={inputClass} />
        <input value={form.landmark} onChange={set("landmark")} placeholder="Landmark" className={inputClass} />
        <input value={form.city} onChange={set("city")} placeholder="City *" className={inputClass} />
        <input value={form.state} onChange={set("state")} placeholder="State" className={inputClass} />
        <input value={form.pincode} onChange={set("pincode")} placeholder="Pincode *" inputMode="numeric" maxLength={6} className={inputClass} />
        <input value={form.phone} onChange={set("phone")} placeholder="Contact number at this address" inputMode="numeric" maxLength={10} className={inputClass} />
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
          {saving ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-xs font-bold">
          Cancel
        </button>
      </div>
    </div>
  );
}
