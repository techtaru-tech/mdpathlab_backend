import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { addressLine, inputClass, todayIst } from "@/components/admin/booking/BookingFormParts";
import { PatientPicker } from "@/components/admin/booking/PatientPicker";
import {
  AdminApiError,
  adminHomeVisitsApi,
  adminPatientsApi,
  HOME_VISIT_SOURCE_LABELS,
  type AdminHomeVisit,
  type AdminHomeVisitInput,
  type AdminPatientDetail,
  type HomeVisitSource,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

type VisitWindow = AdminHomeVisitInput["preferredWindow"];
// Same windows as the API (HOME_VISIT_WINDOWS), in IST.
const WINDOWS: { id: VisitWindow; label: string; end: string }[] = [
  { id: "MORNING", label: "7 AM – 11 AM", end: "11:00" },
  { id: "AFTERNOON", label: "11 AM – 3 PM", end: "15:00" },
  { id: "EVENING", label: "3 PM – 7 PM", end: "19:00" },
];
const MAX_DAYS_AHEAD = 6;
const SOURCES = Object.keys(HOME_VISIT_SOURCE_LABELS) as HomeVisitSource[];

const windowOver = (date: string, end: string) => date === todayIst() && new Date(`${date}T${end}:00+05:30`).getTime() <= Date.now();
const lastDate = () => new Date(Date.parse(`${todayIst()}T00:00:00Z`) + MAX_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-5 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">{children}</h3>
);

/** Patient details, address, date / window and source — shared by the new and edit dialogs. */
function VisitFields({ value, onChange }: { value: AdminHomeVisitInput; onChange: (v: AdminHomeVisitInput) => void }) {
  const set = <K extends keyof AdminHomeVisitInput>(k: K, v: AdminHomeVisitInput[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <Label>Patient on the visit</Label>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        <input value={value.patientName} onChange={(e) => set("patientName", e.target.value)} placeholder="Patient name *" className={inputClass} />
        <input value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Mobile number *" inputMode="numeric" maxLength={10} className={inputClass} />
        <input
          value={value.age ?? ""}
          onChange={(e) => {
            const n = e.target.value.replace(/\D/g, "");
            const { age: _age, ...rest } = value;
            onChange(n ? { ...rest, age: Number(n) } : rest);
          }}
          placeholder="Age"
          inputMode="numeric"
          maxLength={3}
          className={inputClass}
        />
        <select value={value.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={inputClass}>
          <option value="">Gender</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <textarea
        value={value.concern ?? ""}
        onChange={(e) => set("concern", e.target.value)}
        placeholder="What the patient said / tests asked for (optional)"
        rows={2}
        maxLength={500}
        className="mt-2.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
      />

      <Label>When</Label>
      <div className="mt-2 flex flex-wrap gap-2.5">
        <input type="date" value={value.preferredDate} min={todayIst()} max={lastDate()} onChange={(e) => set("preferredDate", e.target.value)} className={cn(inputClass, "w-auto")} />
        {WINDOWS.map((w) => {
          const over = windowOver(value.preferredDate, w.end);
          return (
            <button
              key={w.id}
              type="button"
              disabled={over}
              onClick={() => set("preferredWindow", w.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-bold",
                value.preferredWindow === w.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                over && "cursor-not-allowed opacity-40",
              )}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <Label>Enquiry came by</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set("source", s)}
            className={cn("rounded-lg border px-3 py-2 text-xs font-bold", value.source === s ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted")}
          >
            {HOME_VISIT_SOURCE_LABELS[s]}
          </button>
        ))}
      </div>
    </>
  );
}

function validate(v: AdminHomeVisitInput): string {
  if (v.patientName.trim().length < 2) return "Enter the patient's name";
  if (!/^[6-9]\d{9}$/.test(v.phone.trim())) return "Enter a valid 10-digit mobile number";
  if (v.address.trim().length < 5) return "Enter the complete address";
  if (v.city.trim().length < 2) return "Enter the city";
  if (!/^\d{6}$/.test(v.pincode.trim())) return "Enter a 6-digit pincode";
  if (!v.preferredDate) return "Choose the date";
  if (windowOver(v.preferredDate, WINDOWS.find((w) => w.id === v.preferredWindow)!.end)) return "That time window has already passed — choose a later one";
  return "";
}

const emptyVisit = (): AdminHomeVisitInput => ({
  patientName: "",
  phone: "",
  address: "",
  city: "",
  pincode: "",
  preferredDate: todayIst(),
  preferredWindow: WINDOWS.find((w) => !windowOver(todayIst(), w.end))?.id ?? "MORNING",
  source: "PHONE",
});

/** A home visit for an enquiry by phone, WhatsApp or walk-in. The patient is told it was booked for them. */
export function NewHomeVisitDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [patient, setPatient] = useState<AdminPatientDetail | null>(null);
  const [visit, setVisit] = useState<AdminHomeVisitInput>(emptyVisit);
  const [addressMode, setAddressMode] = useState<string>("typed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPatient(null);
    if (!patientId) return;
    adminPatientsApi
      .get(patientId)
      .then((p) => {
        setPatient(p);
        setVisit((v) => ({ ...v, patientName: v.patientName || p.name || "", phone: v.phone || p.phone }));
        const first = p.addresses.find((a) => !a.deletedAt && a.isDefault) ?? p.addresses.find((a) => !a.deletedAt);
        if (first) pickAddress(first.id, p);
      })
      .catch(() => setPatient(null));
    // pickAddress only reads its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function pickAddress(id: string, p: AdminPatientDetail | null = patient) {
    setAddressMode(id);
    if (id === "typed") {
      setVisit(({ addressId: _a, ...v }) => ({ ...v, address: "", city: "", pincode: "" }));
      return;
    }
    const a = p?.addresses.find((x) => x.id === id);
    if (a) setVisit((v) => ({ ...v, addressId: a.id, address: [a.houseNo, a.line1, a.landmark].filter(Boolean).join(", "), city: a.city, pincode: a.pincode }));
  }

  async function save() {
    if (!patientId) return setError("Choose the patient first");
    const problem = validate(visit);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const { age, gender, concern, addressId, ...rest } = visit;
      await adminHomeVisitsApi.create(patientId, {
        ...rest,
        patientName: rest.patientName.trim(),
        address: rest.address.trim(),
        city: rest.city.trim(),
        ...(age !== undefined ? { age } : {}),
        ...(gender ? { gender } : {}),
        ...(concern?.trim() ? { concern: concern.trim() } : {}),
        ...(addressId ? { addressId } : {}),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create the home visit");
      setSaving(false);
    }
  }

  const saved = patient?.addresses.filter((a) => !a.deletedAt) ?? [];

  return (
    <Shell title="New home visit" subtitle="For an enquiry that came by phone, WhatsApp or walk-in. The patient gets the usual confirmation." onClose={onClose}>
      <Label>Patient account</Label>
      <div className="mt-2">
        <PatientPicker patient={patient} onPick={setPatientId} />
      </div>

      <VisitFields value={visit} onChange={setVisit} />

      <Label>Address</Label>
      <div className="mt-2 space-y-2">
        {saved.map((a) => (
          <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", addressMode === a.id ? "border-primary bg-primary-soft" : "border-border")}>
            <input type="radio" name="hv-address" checked={addressMode === a.id} onChange={() => pickAddress(a.id)} className="mt-1" />
            <span>{addressLine(a)}</span>
          </label>
        ))}
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm", addressMode === "typed" ? "border-primary bg-primary-soft" : "border-border")}>
          <input type="radio" name="hv-address" checked={addressMode === "typed"} onChange={() => pickAddress("typed")} />
          Type the address
        </label>
        {addressMode === "typed" ? (
          <div className="grid gap-2.5 sm:grid-cols-3">
            <input value={visit.address} onChange={(e) => setVisit({ ...visit, address: e.target.value })} placeholder="House, street, area *" className={cn(inputClass, "sm:col-span-3")} />
            <input value={visit.city} onChange={(e) => setVisit({ ...visit, city: e.target.value })} placeholder="City *" className={inputClass} />
            <input value={visit.pincode} onChange={(e) => setVisit({ ...visit, pincode: e.target.value })} placeholder="Pincode *" inputMode="numeric" maxLength={6} className={inputClass} />
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {saving ? "Creating…" : "Create home visit"}
        </button>
      </div>
    </Shell>
  );
}

/** Correct a visit before the phlebotomist sets off; only what changed is sent. */
export function EditHomeVisitDialog({ visit, onClose, onSaved }: { visit: AdminHomeVisit; onClose: () => void; onSaved: (v: AdminHomeVisit) => void }) {
  const initial: AdminHomeVisitInput = {
    patientName: visit.patientName,
    phone: visit.phone,
    ...(visit.age !== null ? { age: visit.age } : {}),
    ...(visit.gender ? { gender: visit.gender } : {}),
    ...(visit.concern ? { concern: visit.concern } : {}),
    address: visit.address,
    city: visit.city,
    pincode: visit.pincode,
    preferredDate: visit.preferredDate,
    preferredWindow: visit.preferredWindow,
    source: visit.source ?? "OTHER",
  };
  const [value, setValue] = useState<AdminHomeVisitInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const problem = validate(value);
    if (problem) return setError(problem);
    const changes: Partial<AdminHomeVisitInput> = {};
    for (const k of Object.keys(value) as (keyof AdminHomeVisitInput)[]) {
      const v = typeof value[k] === "string" ? (value[k] as string).trim() : value[k];
      if (v !== initial[k] && !(k === "source" && !visit.source && v === "OTHER")) (changes as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(changes).length === 0) return setError("Nothing was changed");
    setSaving(true);
    setError("");
    try {
      onSaved(await adminHomeVisitsApi.update(visit.id, changes));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save the changes");
      setSaving(false);
    }
  }

  return (
    <Shell title="Edit home visit" subtitle={`${visit.patientName} · the patient (and the phlebotomist, if assigned) is told about a new date or address.`} onClose={onClose}>
      <VisitFields value={value} onChange={setValue} />
      <Label>Address</Label>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
        <input
          value={value.address}
          onChange={(e) => setValue({ ...value, address: e.target.value })}
          disabled={Boolean(visit.orderId)}
          placeholder="House, street, area *"
          className={cn(inputClass, "sm:col-span-3")}
        />
        <input value={value.city} onChange={(e) => setValue({ ...value, city: e.target.value })} disabled={Boolean(visit.orderId)} placeholder="City *" className={inputClass} />
        <input
          value={value.pincode}
          onChange={(e) => setValue({ ...value, pincode: e.target.value })}
          disabled={Boolean(visit.orderId)}
          placeholder="Pincode *"
          inputMode="numeric"
          maxLength={6}
          className={inputClass}
        />
      </div>
      {visit.orderId ? <p className="mt-2 text-xs text-muted-foreground">Tests are already on this visit — change the address from booking {visit.orderNumber}.</p> : null}

      {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Shell>
  );
}
