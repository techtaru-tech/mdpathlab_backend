import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Trash2, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { apiFileUrl } from "@/lib/api";
import { MEDICAL_COUNCILS, matchCouncil } from "@/lib/medical-councils";
import {
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
  PartnerApiError,
  partnerApi,
  type ClinicTypeOption,
  type DocumentKind,
  type PartnerMe,
  type Requirement,
} from "@/lib/partner-api";

export const Route = createFileRoute("/partner/register")({
  head: () => ({ meta: [{ title: "Partner Application — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerApplicationPage,
});

const inputClass = "h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60";
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const errorText = (err: unknown, fallback: string) => (err instanceof PartnerApiError ? err.message : fallback);

function PartnerApplicationPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return <PartnerLayout activePath="/partner/register">{enabled ? <Application /> : null}</PartnerLayout>;
}

function Application() {
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    partnerApi
      .me()
      .then(setMe)
      .catch((err) => setError(errorText(err, "Couldn't load your application")));
  }, []);

  if (error) return <p className="text-sm font-semibold text-destructive">{error}</p>;
  if (!me) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const hasDetails = me.type === "DOCTOR" ? Boolean(me.doctorProfile) : Boolean(me.clinicProfile);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{me.type === "DOCTOR" ? "Doctor application" : "Clinic application"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me.editable ? "Fill in your details, upload the documents, then submit for review." : "Your application has been submitted and can no longer be edited."}
          </p>
        </div>
        <StatusBadge tone={PARTNER_STATUS_TONES[me.status]}>{PARTNER_STATUS_LABELS[me.status]}</StatusBadge>
      </div>

      {me.status === "REJECTED" && me.lastDecision?.reason ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span className="font-bold">Changes needed:</span> {me.lastDecision.reason}
        </div>
      ) : null}

      <Section title="1. Details">{me.type === "DOCTOR" ? <DoctorForm me={me} onSaved={setMe} /> : <ClinicForm me={me} onSaved={setMe} />}</Section>

      <Section title="2. Documents">
        {hasDetails ? <Documents me={me} onChange={setMe} /> : <p className="text-sm text-muted-foreground">Save your details first — the documents you need depend on them.</p>}
      </Section>

      {me.editable ? (
        <Section title="3. Submit">
          <Submit me={me} hasDetails={hasDetails} onSubmitted={setMe} />
        </Section>
      ) : (
        <Link to="/partner" className="inline-block text-sm font-bold text-primary hover:underline">
          ← Back to overview
        </Link>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-base font-extrabold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

function DoctorForm({ me, onSaved }: { me: PartnerMe; onSaved: (me: PartnerMe) => void }) {
  const p = me.doctorProfile;
  const [form, setForm] = useState({
    fullName: p?.fullName ?? me.displayName ?? "",
    email: me.email ?? "",
    medicalCouncil: matchCouncil(p?.medicalCouncil),
    registrationNumber: p?.registrationNumber ?? "",
    registrationYear: p?.registrationYear ? String(p.registrationYear) : "",
    qualification: p?.qualification ?? "",
    specialization: p?.specialization ?? "",
    city: p?.city ?? "",
    pincode: p?.pincode ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await partnerApi.saveDoctor({
        fullName: form.fullName,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        medicalCouncil: form.medicalCouncil,
        registrationNumber: form.registrationNumber,
        ...(form.registrationYear ? { registrationYear: Number(form.registrationYear) } : {}),
        qualification: form.qualification,
        ...(form.specialization.trim() ? { specialization: form.specialization.trim() } : {}),
        city: form.city,
        pincode: form.pincode,
      });
      onSaved(updated);
      setMessage({ ok: true, text: "Details saved" });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save your details") });
    } finally {
      setSaving(false);
    }
  }

  const disabled = !me.editable;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" wide>
        <input value={form.fullName} onChange={set("fullName")} disabled={disabled} className={inputClass} placeholder="Dr. Full Name" />
      </Field>
      <Field label="Medical council">
        {/* A fixed list, so the same doctor can't register twice under two spellings of one council. A submitted
            application saved before the list existed keeps showing its original text. */}
        {disabled && !form.medicalCouncil && p?.medicalCouncil ? (
          <input value={p.medicalCouncil} disabled className={inputClass} />
        ) : (
          <select value={form.medicalCouncil} onChange={set("medicalCouncil")} disabled={disabled} className={inputClass}>
            <option value="">Choose your council…</option>
            {MEDICAL_COUNCILS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Registration number">
        <input value={form.registrationNumber} onChange={set("registrationNumber")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Year of registration (optional)">
        <input value={form.registrationYear} onChange={set("registrationYear")} disabled={disabled} inputMode="numeric" className={inputClass} />
      </Field>
      <Field label="Qualification">
        <input value={form.qualification} onChange={set("qualification")} disabled={disabled} className={inputClass} placeholder="e.g. MBBS, MD (Medicine)" />
      </Field>
      <Field label="Specialisation (optional)">
        <input value={form.specialization} onChange={set("specialization")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Email (optional)">
        <input value={form.email} onChange={set("email")} disabled={disabled} type="email" className={inputClass} />
      </Field>
      <Field label="City">
        <input value={form.city} onChange={set("city")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Pincode">
        <input value={form.pincode} onChange={set("pincode")} disabled={disabled} inputMode="numeric" maxLength={6} className={inputClass} />
      </Field>
      {me.editable ? (
        <div className="flex items-center gap-3 sm:col-span-2">
          <ActionButton variant="navy" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save details"}
          </ActionButton>
          {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ClinicForm({ me, onSaved }: { me: PartnerMe; onSaved: (me: PartnerMe) => void }) {
  const p = me.clinicProfile;
  const [types, setTypes] = useState<ClinicTypeOption[]>([]);
  const [preview, setPreview] = useState<Requirement[]>([]);
  const [form, setForm] = useState({
    clinicName: p?.clinicName ?? me.displayName ?? "",
    clinicTypeCode: p?.clinicTypeCode ?? "",
    email: me.email ?? "",
    registrationAuthority: p?.registrationAuthority ?? "",
    registrationNumber: p?.registrationNumber ?? "",
    gstin: p?.gstin ?? "",
    address: p?.address ?? "",
    city: p?.city ?? "",
    state: p?.state ?? "",
    pincode: p?.pincode ?? "",
    contactPersonName: p?.contactPersonName ?? "",
    contactPersonDesignation: p?.contactPersonDesignation ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (me.editable) partnerApi.clinicTypes().then(setTypes).catch(() => {});
  }, [me.editable]);

  // Show which documents the chosen clinic type asks for, before the details are even saved.
  useEffect(() => {
    if (!me.editable || !form.clinicTypeCode) {
      setPreview([]);
      return;
    }
    partnerApi
      .requirements(form.clinicTypeCode)
      .then(setPreview)
      .catch(() => setPreview([]));
  }, [form.clinicTypeCode, me.editable]);

  const selectedType = types.find((t) => t.code === form.clinicTypeCode) ?? (p?.clinicTypeCode === form.clinicTypeCode ? p?.clinicType : undefined);

  async function save() {
    setSaving(true);
    setMessage(null);
    const optional = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      const updated = await partnerApi.saveClinic({
        clinicName: form.clinicName,
        clinicTypeCode: form.clinicTypeCode,
        email: optional(form.email),
        registrationAuthority: optional(form.registrationAuthority),
        registrationNumber: optional(form.registrationNumber),
        gstin: optional(form.gstin),
        address: form.address,
        city: form.city,
        state: optional(form.state),
        pincode: form.pincode,
        contactPersonName: form.contactPersonName,
        contactPersonDesignation: optional(form.contactPersonDesignation),
      });
      onSaved(updated);
      setMessage({ ok: true, text: "Details saved" });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save your details") });
    } finally {
      setSaving(false);
    }
  }

  const disabled = !me.editable;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Clinic / hospital name" wide>
        <input value={form.clinicName} onChange={set("clinicName")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Type of establishment" wide>
        {disabled ? (
          <input value={p?.clinicType.label ?? ""} disabled className={inputClass} />
        ) : (
          <select value={form.clinicTypeCode} onChange={set("clinicTypeCode")} className={inputClass}>
            <option value="">Choose…</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {preview.length > 0 ? (
        <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground sm:col-span-2">
          <span className="font-bold text-foreground">Documents for this type: </span>
          {preview.map((r) => `${r.label}${r.level === "MANDATORY" ? " (required)" : " (optional)"}`).join(" · ")}
        </div>
      ) : null}
      <Field label={`${selectedType?.registrationNumberLabel ?? "Registration number"}${selectedType?.registrationNumberRequired ? "" : " (optional)"}`}>
        <input value={form.registrationNumber} onChange={set("registrationNumber")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Registering authority (optional)">
        <input value={form.registrationAuthority} onChange={set("registrationAuthority")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="GSTIN (optional)">
        <input value={form.gstin} onChange={set("gstin")} disabled={disabled} className={inputClass} maxLength={15} />
      </Field>
      <Field label="Email (optional)">
        <input value={form.email} onChange={set("email")} disabled={disabled} type="email" className={inputClass} />
      </Field>
      <Field label="Address" wide>
        <textarea value={form.address} onChange={set("address")} disabled={disabled} rows={2} className="w-full rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none disabled:opacity-60" />
      </Field>
      <Field label="City">
        <input value={form.city} onChange={set("city")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="State (optional)">
        <input value={form.state} onChange={set("state")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Pincode">
        <input value={form.pincode} onChange={set("pincode")} disabled={disabled} inputMode="numeric" maxLength={6} className={inputClass} />
      </Field>
      <Field label="Contact person">
        <input value={form.contactPersonName} onChange={set("contactPersonName")} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Contact person's designation (optional)">
        <input value={form.contactPersonDesignation} onChange={set("contactPersonDesignation")} disabled={disabled} className={inputClass} />
      </Field>
      {me.editable ? (
        <div className="flex items-center gap-3 sm:col-span-2">
          <ActionButton variant="navy" size="sm" onClick={save} disabled={saving || !form.clinicTypeCode}>
            {saving ? "Saving…" : "Save details"}
          </ActionButton>
          {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Documents({ me, onChange }: { me: PartnerMe; onChange: (me: PartnerMe) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function upload(kind: DocumentKind, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setError("");
    try {
      onChange(await partnerApi.uploadDocument(kind, file));
    } catch (err) {
      setError(errorText(err, "Couldn't upload the file"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError("");
    try {
      onChange(await partnerApi.removeDocument(id));
    } catch (err) {
      setError(errorText(err, "Couldn't remove the file"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">PDF or photo (JPEG, PNG, WebP, HEIC), up to 10 MB each. Your documents are only visible to MD Path Labs staff.</p>
      {me.requirements.map((r) => {
        const files = me.documents.filter((d) => d.kind === r.documentKind);
        return (
          <div key={r.documentKind} className="rounded-xl border border-border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {r.label}{" "}
                <span className={r.level === "MANDATORY" ? "text-xs font-bold text-destructive" : "text-xs font-semibold text-muted-foreground"}>
                  {r.level === "MANDATORY" ? "Required" : "Optional"}
                </span>
              </p>
              {me.editable ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft">
                  <Upload className="h-3.5 w-3.5" /> {busy === r.documentKind ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    disabled={busy !== null}
                    onChange={(e) => {
                      upload(r.documentKind, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : null}
            </div>
            {files.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {files.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <a href={apiFileUrl(d.fileUrl)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 font-semibold text-primary hover:underline">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">Uploaded {new Date(d.uploadedAt).toLocaleDateString("en-IN")}</span>
                    </a>
                    {me.editable ? (
                      <button type="button" onClick={() => remove(d.id)} disabled={busy !== null} aria-label="Remove document" className="text-destructive/80 hover:text-destructive disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function Submit({ me, hasDetails, onSubmitted }: { me: PartnerMe; hasDetails: boolean; onSubmitted: (me: PartnerMe) => void }) {
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const ready = hasDetails && me.missingDocuments.length === 0;

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      onSubmitted(await partnerApi.submit());
    } catch (err) {
      setError(errorText(err, "Couldn't submit your application"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!ready ? (
        <p className="text-sm text-muted-foreground">
          {hasDetails ? `Still needed: ${me.missingDocuments.join(", ")}` : "Save your details and upload the required documents first."}
        </p>
      ) : null}
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-1" />
        <span>I confirm that the details and documents I have provided are genuine, and that I am authorised to submit them.</span>
      </label>
      <ActionButton variant="primary" size="sm" onClick={submit} disabled={!ready || !declared || submitting}>
        {submitting ? "Submitting…" : "Submit for review"}
      </ActionButton>
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
