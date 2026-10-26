import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FileText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { apiFileUrl } from "@/lib/api";
import { adminPartnersApi, type AdminAffiliation, type AdminPartnerDetail, type PartnerDecision } from "@/lib/admin-partners-api";
import { PARTNER_STATUS_LABELS, PARTNER_STATUS_TONES } from "@/lib/partner-api";
import { ATTEMPT_LABELS, adminReferralsApi, type PartnerReferralSummary } from "@/lib/admin-referrals-api";

export const Route = createFileRoute("/admin/partners/$partnerId")({
  head: () => ({ meta: [{ title: "Doctor / Clinic — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPartnerDetailPage,
});

const DECISIONS: Record<PartnerDecision, { label: string; needsReason: boolean; variant: "navy" | "outline" }> = {
  approve: { label: "Approve", needsReason: false, variant: "navy" },
  reject: { label: "Reject", needsReason: true, variant: "outline" },
  suspend: { label: "Suspend", needsReason: true, variant: "outline" },
  reactivate: { label: "Reactivate", needsReason: true, variant: "navy" },
};

// Mirrors the server's transition table (partner-status.ts); the server re-checks every decision.
const AVAILABLE: Record<string, PartnerDecision[]> = {
  PENDING: ["approve", "reject"],
  APPROVED: ["suspend"],
  SUSPENDED: ["reactivate"],
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function AdminPartnerDetailPage() {
  const { partnerId } = Route.useParams();
  const [partner, setPartner] = useState<AdminPartnerDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminPartnersApi
      .get(partnerId)
      .then(setPartner)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this partner"));
  }, [partnerId]);

  return (
    <AdminLayout activePath="/admin/partners">
      <Link to="/admin/partners" className="text-xs font-bold text-primary hover:underline">
        ← Doctors &amp; Clinics
      </Link>
      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}
      {partner ? <Detail partner={partner} onChange={setPartner} /> : !error ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}
    </AdminLayout>
  );
}

function Detail({ partner, onChange }: { partner: AdminPartnerDetail; onChange: (p: AdminPartnerDetail) => void }) {
  const isDoctor = partner.type === "DOCTOR";
  const affiliations = (isDoctor ? partner.doctorProfile?.affiliations : partner.clinicProfile?.affiliations) ?? [];

  return (
    <div className="mt-3 space-y-6">
      <AdminPageHeader
        title={partner.displayName || "(details not saved)"}
        description={`${isDoctor ? "Doctor" : "Clinic"} · +91 ${partner.phone}${partner.email ? ` · ${partner.email}` : ""} · registered ${fmt(partner.createdAt)}`}
        actions={<StatusBadge tone={PARTNER_STATUS_TONES[partner.status]}>{PARTNER_STATUS_LABELS[partner.status]}</StatusBadge>}
      />

      {partner.possibleDuplicates.length > 0 ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm shadow-sm">
          <p className="flex items-center gap-1.5 font-bold text-warning">
            <AlertTriangle className="h-4 w-4" /> Possible duplicate accounts — check before deciding
          </p>
          <ul className="mt-2 space-y-1">
            {partner.possibleDuplicates.map((d) => (
              <li key={d.id}>
                <Link to="/admin/partners/$partnerId" params={{ partnerId: d.id }} className="font-semibold text-primary hover:underline">
                  {d.displayName || "(details not saved)"}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.type === "DOCTOR" ? "Doctor" : "Clinic"} · {PARTNER_STATUS_LABELS[d.status]}
                  {d.registration ? ` · ${d.registration}` : ""} · same {d.matchedOn.join(" and ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Decisions partner={partner} onChange={onChange} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={isDoctor ? "Professional details" : "Clinic details"}>
          {isDoctor && partner.doctorProfile ? (
            <Rows
              rows={[
                ["Name", partner.doctorProfile.fullName],
                ["Medical council", partner.doctorProfile.medicalCouncil],
                ["Registration no.", partner.doctorProfile.registrationNumber],
                ["Registration year", partner.doctorProfile.registrationYear ? String(partner.doctorProfile.registrationYear) : null],
                ["Qualification", partner.doctorProfile.qualification],
                ["Specialisation", partner.doctorProfile.specialization],
                ["City / pincode", `${partner.doctorProfile.city} · ${partner.doctorProfile.pincode}`],
              ]}
            />
          ) : !isDoctor && partner.clinicProfile ? (
            <Rows
              rows={[
                ["Name", partner.clinicProfile.clinicName],
                ["Type", partner.clinicProfile.clinicType.label],
                ["Registration no.", partner.clinicProfile.registrationNumber],
                ["Registering authority", partner.clinicProfile.registrationAuthority],
                ["GSTIN", partner.clinicProfile.gstin],
                ["Address", partner.clinicProfile.address],
                ["City / state / pincode", [partner.clinicProfile.city, partner.clinicProfile.state, partner.clinicProfile.pincode].filter(Boolean).join(" · ")],
                ["Contact person", [partner.clinicProfile.contactPersonName, partner.clinicProfile.contactPersonDesignation].filter(Boolean).join(", ")],
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Details not saved yet.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Submitted {fmt(partner.submittedAt)} · declaration accepted {fmt(partner.declarationAcceptedAt)}
          </p>
        </Card>

        <Card title="Documents">
          {partner.missingDocuments.length > 0 ? (
            <p className="mb-3 flex items-start gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Missing: {partner.missingDocuments.join(", ")}
            </p>
          ) : null}
          {partner.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {partner.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={apiFileUrl(d.fileUrl)} target="_blank" rel="noreferrer" className={d.removedAt ? "flex min-w-0 items-center gap-1.5 text-muted-foreground line-through" : "flex min-w-0 items-center gap-1.5 font-semibold text-primary hover:underline"}>
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{d.label}</span>
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.removedAt ? `removed ${fmt(d.removedAt)}` : fmt(d.uploadedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Asked for: {partner.requirements.map((r) => `${r.label}${r.level === "MANDATORY" ? " (required)" : ""}`).join(", ") || "—"}
          </p>
        </Card>
      </div>

      <Card title={isDoctor ? "Clinics" : "Doctors"}>
        <Affiliations rows={affiliations} isDoctor={isDoctor} onChanged={() => adminPartnersApi.get(partner.id).then(onChange)} />
      </Card>

      <Card title="Referral code">
        <ReferralCodeCard partnerId={partner.id} approved={partner.status === "APPROVED"} />
      </Card>

      <Card title="History">
        <ul className="space-y-2.5">
          {partner.events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-semibold">{e.event.replace(/_/g, " ").toLowerCase()}</span>
              {e.fromStatus && e.toStatus ? <span className="text-muted-foreground"> · {e.fromStatus} → {e.toStatus}</span> : null}
              <span className="text-muted-foreground"> · {e.actorType === "ADMIN" ? e.actorLabel : e.actorType.toLowerCase()} · {fmt(e.createdAt)}</span>
              {e.reason ? <p className="text-xs text-foreground/80">Reason: {e.reason}</p> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Decisions({ partner, onChange }: { partner: AdminPartnerDetail; onChange: (p: AdminPartnerDetail) => void }) {
  const available = AVAILABLE[partner.status] ?? [];
  const [pending, setPending] = useState<PartnerDecision | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (available.length === 0) return null;

  async function confirm() {
    if (!pending) return;
    if (DECISIONS[pending].needsReason && reason.trim().length < 3) {
      setError("Please give a reason");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onChange(await adminPartnersApi.decide(partner.id, pending, reason.trim() || undefined));
      setPending(null);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {available.map((d) => (
          <ActionButton key={d} size="sm" variant={pending === d ? "navy" : DECISIONS[d].variant} onClick={() => setPending(d)} disabled={saving}>
            {DECISIONS[d].label}
          </ActionButton>
        ))}
      </div>
      {pending ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={DECISIONS[pending].needsReason ? "Reason (required — the applicant sees this)" : "Note (optional)"}
            className="w-full rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <ActionButton size="sm" variant="primary" onClick={confirm} disabled={saving}>
              {saving ? "Saving…" : `Confirm: ${DECISIONS[pending].label}`}
            </ActionButton>
            <button type="button" onClick={() => setPending(null)} className="text-sm font-semibold text-muted-foreground hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function Affiliations({ rows, isDoctor, onChanged }: { rows: AdminAffiliation[]; isDoctor: boolean; onChanged: () => Promise<unknown> }) {
  const [error, setError] = useState("");

  async function act(id: string, decision: "approve" | "reject" | "end") {
    const reason = window.prompt(`Reason to ${decision} this affiliation`)?.trim();
    if (!reason) return;
    setError("");
    try {
      await adminPartnersApi.decideAffiliation(id, decision, reason);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the affiliation");
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((a) => {
          const other = isDoctor ? a.clinic : a.doctor;
          const name = isDoctor ? a.clinic?.clinicName : a.doctor?.fullName;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                {other ? (
                  <Link to="/admin/partners/$partnerId" params={{ partnerId: other.partnerId }} className="font-semibold text-primary hover:underline">
                    {name}
                  </Link>
                ) : null}
                <span className="text-muted-foreground"> · {other?.city} · {a.status.toLowerCase()}</span>
              </div>
              <div className="flex gap-3 text-xs font-bold">
                {a.status === "REQUESTED" ? (
                  <>
                    <button type="button" onClick={() => act(a.id, "approve")} className="text-primary hover:underline">
                      Approve
                    </button>
                    <button type="button" onClick={() => act(a.id, "reject")} className="text-destructive hover:underline">
                      Reject
                    </button>
                  </>
                ) : null}
                {a.status === "REQUESTED" || a.status === "ACTIVE" ? (
                  <button type="button" onClick={() => act(a.id, "end")} className="text-destructive hover:underline">
                    End
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}
    </>
  );
}

// Codes (active + retired), totals and recent claim outcomes for this partner; reissue retires the active code.
function ReferralCodeCard({ partnerId, approved }: { partnerId: string; approved: boolean }) {
  const [data, setData] = useState<PartnerReferralSummary | null>(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminReferralsApi
      .partner(partnerId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load referral details"));
  }, [partnerId]);

  async function reissue() {
    if (reason.trim().length < 3) {
      setError("Please give a reason");
      return;
    }
    setError("");
    try {
      setData(await adminReferralsApi.reissue(partnerId, reason.trim()));
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't issue a new code");
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">{error || "Loading…"}</p>;
  const active = data.codes.find((c) => !c.retiredAt);
  const referred = (data.referredPatients.ACTIVE ?? 0) + (data.referredPatients.DISPUTED ?? 0);
  return (
    <div className="space-y-3 text-sm">
      {active ? (
        <p>
          Active code <span className="font-mono font-bold">{active.code}</span> · issued {fmt(active.issuedAt)} ·{" "}
          <a href={active.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
            link
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">No code issued yet — it is created the first time the partner opens their referral kit.</p>
      )}
      <p className="text-muted-foreground">
        {referred} referred patient(s) · {data.attributedBookings} attributed booking(s)
        {data.referredPatients.REVOKED ? ` · ${data.referredPatients.REVOKED} revoked` : ""}
      </p>
      {Object.keys(data.attemptsLast30Days).length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Last 30 days:{" "}
          {Object.entries(data.attemptsLast30Days)
            .map(([k, n]) => `${ATTEMPT_LABELS[k as keyof typeof ATTEMPT_LABELS]} ${n}`)
            .join(" · ")}
        </p>
      ) : null}
      {data.codes.some((c) => c.retiredAt) ? (
        <p className="text-xs text-muted-foreground">
          Retired: {data.codes.filter((c) => c.retiredAt).map((c) => `${c.code} (${c.retiredReason ?? "no reason"})`).join(", ")}
        </p>
      ) : null}
      {approved ? (
        open ? (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why replace the code? (the old link and printed QR codes stop working)"
              className="w-full rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <ActionButton size="sm" variant="primary" onClick={reissue}>
                Issue new code
              </ActionButton>
              <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-muted-foreground hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-primary hover:underline">
            Replace code…
          </button>
        )
      ) : null}
      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
      <Link to="/admin/referrals" className="inline-block text-xs font-bold text-primary hover:underline">
        Open referrals →
      </Link>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-semibold break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
