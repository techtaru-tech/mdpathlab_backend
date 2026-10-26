import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { DOCUMENT_KIND_LABELS, adminPartnersApi, type AdminClinicType } from "@/lib/admin-partners-api";
import type { DocumentKind } from "@/lib/partner-api";

export const Route = createFileRoute("/admin/partner-settings")({
  head: () => ({ meta: [{ title: "Doctor & Clinic Settings — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPartnerSettingsPage,
});

const inputClass = "h-10 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";
const KINDS = Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[];
type Level = "" | "MANDATORY" | "OPTIONAL";

function AdminPartnerSettingsPage() {
  const [types, setTypes] = useState<AdminClinicType[]>([]);
  const [error, setError] = useState("");

  const load = () =>
    adminPartnersApi
      .clinicTypes()
      .then(setTypes)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load settings"));

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminLayout activePath="/admin/partners">
      <Link to="/admin/partners" className="text-xs font-bold text-primary hover:underline">
        ← Doctors &amp; Clinics
      </Link>
      <div className="mt-3">
        <AdminPageHeader
          title="Doctor & clinic registration settings"
          description="Which documents each applicant type must or may upload. Changes apply to applications not yet submitted; every change is audited."
        />
      </div>
      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6 space-y-6">
        <ClinicTypes types={types} onChanged={load} />
        <RequirementsEditor types={types} onChanged={load} />
      </div>
    </AdminLayout>
  );
}

function ClinicTypes({ types, onChanged }: { types: AdminClinicType[]; onChanged: () => Promise<unknown> }) {
  const [form, setForm] = useState({ code: "", label: "", registrationNumberRequired: false });
  const [error, setError] = useState("");

  async function create() {
    setError("");
    try {
      await adminPartnersApi.createClinicType({ code: form.code.trim().toUpperCase(), label: form.label.trim(), registrationNumberRequired: form.registrationNumberRequired });
      setForm({ code: "", label: "", registrationNumberRequired: false });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the clinic type");
    }
  }

  async function update(code: string, input: Parameters<typeof adminPartnersApi.updateClinicType>[1]) {
    setError("");
    try {
      await adminPartnersApi.updateClinicType(code, input);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the clinic type");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Clinic types</h2>
      <ul className="divide-y divide-border">
        {types.map((t) => (
          <li key={t.code} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <p className="font-semibold">
                {t.label} <span className="text-xs text-muted-foreground">({t.code})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t.requirements.filter((r) => r.level === "MANDATORY").length} required ·{" "}
                {t.requirements.filter((r) => r.level === "OPTIONAL").length} optional documents · {t._count.clinics} clinic(s)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" checked={t.registrationNumberRequired} onChange={(e) => update(t.code, { registrationNumberRequired: e.target.checked })} />
                Reg. no. required
              </label>
              <StatusBadge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "Open" : "Closed"}</StatusBadge>
              <button type="button" onClick={() => update(t.code, { isActive: !t.isActive })} className="text-xs font-bold text-primary hover:underline">
                {t.isActive ? "Close for new applications" : "Open for applications"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="CODE (e.g. EYE_HOSPITAL)" className={`${inputClass} w-48`} />
        <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Label shown to applicants" className={`${inputClass} w-64`} />
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={form.registrationNumberRequired} onChange={(e) => setForm((f) => ({ ...f, registrationNumberRequired: e.target.checked }))} />
          Reg. no. required
        </label>
        <ActionButton size="sm" variant="navy" onClick={create} disabled={!form.code.trim() || !form.label.trim()}>
          Add type
        </ActionButton>
        <p className="w-full text-xs text-muted-foreground">A new type starts closed. Set its documents below, then open it.</p>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function RequirementsEditor({ types, onChanged }: { types: AdminClinicType[]; onChanged: () => Promise<unknown> }) {
  // "DOCTOR" or a clinic type code.
  const [scope, setScope] = useState("DOCTOR");
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setMessage(null);
    const isDoctor = scope === "DOCTOR";
    adminPartnersApi
      .requirements(isDoctor ? "DOCTOR" : "CLINIC", isDoctor ? undefined : scope)
      .then((rows) => setLevels(Object.fromEntries(rows.map((r) => [r.documentKind, r.level]))))
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't load requirements" }));
  }, [scope]);

  async function save() {
    if (reason.trim().length < 3) {
      setMessage({ ok: false, text: "Please give a reason for the change" });
      return;
    }
    setSaving(true);
    setMessage(null);
    const isDoctor = scope === "DOCTOR";
    try {
      await adminPartnersApi.replaceRequirements({
        partnerType: isDoctor ? "DOCTOR" : "CLINIC",
        ...(isDoctor ? {} : { clinicTypeCode: scope }),
        items: KINDS.filter((k) => levels[k]).map((k) => ({ documentKind: k, level: levels[k] as "MANDATORY" | "OPTIONAL" })),
        reason: reason.trim(),
      });
      setReason("");
      setMessage({ ok: true, text: "Saved" });
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Required documents</h2>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
          <option value="DOCTOR">Doctors</option>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              Clinic — {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span>{DOCUMENT_KIND_LABELS[k]}</span>
            <select value={levels[k] ?? ""} onChange={(e) => setLevels((l) => ({ ...l, [k]: e.target.value as Level }))} className="h-8 rounded-md border border-border bg-muted px-2 text-xs">
              <option value="">Not asked</option>
              <option value="OPTIONAL">Optional</option>
              <option value="MANDATORY">Required</option>
            </select>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for this change (audited)" className={`${inputClass} min-w-[16rem] flex-1`} />
        <ActionButton size="sm" variant="navy" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save requirements"}
        </ActionButton>
      </div>
      {message ? <p className={message.ok ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}
