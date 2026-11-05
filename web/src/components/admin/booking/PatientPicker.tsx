import { useEffect, useState } from "react";
import { inputClass } from "@/components/admin/booking/BookingFormParts";
import { AdminApiError, adminPatientsApi, type AdminPatient, type AdminPatientDetail } from "@/lib/admin-api";

/** Pick a patient by mobile number or name, or add a new one on the spot. */
export function PatientPicker({ patient, onPick }: { patient: AdminPatientDetail | null; onPick: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminPatient[]>([]);
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      adminPatientsApi
        .list(search.trim())
        .then((r) => setResults(r.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function createPatient() {
    if (!/^[6-9]\d{9}$/.test(phone.trim())) return setError("Enter a valid 10-digit mobile number");
    if (!name.trim()) return setError("Enter the patient's name");
    setSaving(true);
    setError("");
    try {
      const p = await adminPatientsApi.create({ phone: phone.trim(), name: name.trim() });
      setCreating(false);
      onPick(p.id);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't add the patient");
    } finally {
      setSaving(false);
    }
  }

  if (patient) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
        <div>
          <p className="text-sm font-bold">{patient.name || "No name yet"}</p>
          <p className="text-xs text-muted-foreground">{patient.phone}</p>
        </div>
        <button type="button" onClick={() => onPick("")} className="text-xs font-bold text-primary hover:underline">
          Change patient
        </button>
      </div>
    );
  }

  return (
    <div>
      {!creating ? (
        <>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by mobile number or name (min 3 characters)" className={inputClass} />
          {results.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.status !== "ACTIVE"}
                  onClick={() => onPick(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-semibold">{p.name || "No name"}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.phone}
                    {p.status !== "ACTIVE" ? " · inactive" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : search.trim().length >= 3 ? (
            <p className="mt-2 text-xs text-muted-foreground">No patient found.</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              if (/^\d{10}$/.test(search.trim())) setPhone(search.trim());
            }}
            className="mt-3 text-xs font-bold text-primary hover:underline"
          >
            + New patient
          </button>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number *" inputMode="numeric" maxLength={10} className={inputClass} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name *" className={inputClass} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">The patient can log in later with this number (OTP) and will see this booking.</p>
          {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={saving} onClick={createPatient} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
              {saving ? "Adding…" : "Add patient"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-bold">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
