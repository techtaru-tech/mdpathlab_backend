import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, Search, Share2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { adminPartnersApi, type AdminPartnerRow } from "@/lib/admin-partners-api";
import {
  ATTEMPT_LABELS,
  adminReferralsApi,
  type AttemptOutcome,
  type PatientReferralDetail,
  type RecentReferral,
  type ReferralAttemptRow,
  type ReferralHealth,
  type ReferralStatus,
} from "@/lib/admin-referrals-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/referrals")({
  head: () => ({ meta: [{ title: "Referrals — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminReferralsPage,
});

const TABS = [
  { key: "lookup", label: "Patient lookup" },
  { key: "recent", label: "Recent referrals" },
  { key: "attempts", label: "Attempts" },
  { key: "health", label: "Tracking health" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<ReferralStatus, "success" | "warning" | "danger"> = { ACTIVE: "success", DISPUTED: "warning", REVOKED: "danger" };
const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const errText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const inputClass = "h-10 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";

function AdminReferralsPage() {
  const [tab, setTab] = useState<TabKey>("lookup");
  return (
    <AdminLayout activePath="/admin/referrals">
      <AdminPageHeader title="Referrals" description="Which doctor or clinic each patient was referred by, and the bookings that followed. Tracking only — no amounts." />
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold",
              tab === t.key ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground/75 hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "lookup" ? <Lookup /> : null}
        {tab === "recent" ? <Recent /> : null}
        {tab === "attempts" ? <Attempts /> : null}
        {tab === "health" ? <Health /> : null}
      </div>
    </AdminLayout>
  );
}

function PartnerPicker({ onPick }: { onPick: (p: AdminPartnerRow) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminPartnerRow[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      adminPartnersApi
        .list({ status: "APPROVED", q: q.trim() || undefined, pageSize: 8 })
        .then((r) => setRows(r.items))
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search approved doctors / clinics" className={`${inputClass} w-full`} />
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {rows.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onPick(p)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="font-semibold">{p.displayName}</span>
              <span className="text-xs text-muted-foreground"> · {p.type === "DOCTOR" ? "Doctor" : "Clinic"} · {p.doctorProfile?.city ?? p.clinicProfile?.city ?? ""}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-3 py-2 text-xs text-muted-foreground">No approved partners match.</li> : null}
      </ul>
    </div>
  );
}

function Lookup() {
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState<PatientReferralDetail | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"assign" | "reassign" | "dispute" | "revoke" | "restore" | null>(null);
  const [partner, setPartner] = useState<AdminPartnerRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function find() {
    setError("");
    setDetail(null);
    setAction(null);
    try {
      setDetail(await adminReferralsApi.findPatient(phone.trim()));
    } catch (err) {
      setError(errText(err, "Not found"));
    }
  }

  async function save() {
    if (!detail || !action) return;
    if (reason.trim().length < 3) return setError("Please give a reason");
    if ((action === "assign" || action === "reassign") && !partner) return setError("Choose a doctor or clinic");
    setSaving(true);
    setError("");
    try {
      const id = detail.patient.id;
      const next =
        action === "assign"
          ? await adminReferralsApi.assign(id, partner!.id, reason.trim())
          : action === "reassign"
            ? await adminReferralsApi.reassign(id, partner!.id, reason.trim())
            : await adminReferralsApi.setStatus(id, action, reason.trim());
      setDetail(next);
      setAction(null);
      setReason("");
      setPartner(null);
    } catch (err) {
      setError(errText(err, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  const r = detail?.referral;
  const actions: { key: NonNullable<typeof action>; label: string }[] = !detail
    ? []
    : !r
      ? [{ key: "assign", label: "Assign referral" }]
      : [
          { key: "reassign", label: "Reassign" },
          ...(r.status === "ACTIVE" ? [{ key: "dispute" as const, label: "Mark disputed" }] : []),
          ...(r.status !== "REVOKED" ? [{ key: "revoke" as const, label: "Revoke" }] : []),
          ...(r.status !== "ACTIVE" ? [{ key: "restore" as const, label: "Restore" }] : []),
        ];

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onKeyDown={(e) => e.key === "Enter" && find()}
          placeholder="Patient mobile number"
          className="w-full bg-transparent text-sm focus:outline-none"
        />
        <ActionButton size="sm" variant="navy" onClick={find} disabled={phone.length !== 10}>
          Find
        </ActionButton>
      </div>
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      {detail ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold">{detail.patient.name || "(no name)"}</p>
              <p className="text-xs text-muted-foreground">
                +91 {detail.patient.phone} · joined {fmt(detail.patient.createdAt)} · {detail.patient._count.orders} order(s)
              </p>
            </div>
            {r ? <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge> : <StatusBadge tone="neutral">No referral</StatusBadge>}
          </div>

          {r ? (
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Referred by</dt>
              <dd className="font-semibold">
                <Link to="/admin/partners/$partnerId" params={{ partnerId: r.partner.id }} className="text-primary hover:underline">
                  {r.partner.displayName}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">({r.partner.type === "DOCTOR" ? "Doctor" : "Clinic"}, {r.partner.status.toLowerCase()})</span>
              </dd>
              <dt className="text-muted-foreground">Linked</dt>
              <dd className="font-semibold">
                {fmt(r.boundAt)} · {r.source.toLowerCase()} · {r.boundVia === "ADMIN" ? "by admin" : "by patient"}
              </dd>
              <dt className="text-muted-foreground">Code used</dt>
              <dd className="font-semibold">{r.code?.code ?? "—"}</dd>
              <dt className="text-muted-foreground">Attributed bookings</dt>
              <dd className="font-semibold">{r._count.orderAttributions}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">This patient has no referring doctor. An admin can assign one (only future bookings are attributed).</p>
          )}

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <ActionButton key={a.key} size="sm" variant={action === a.key ? "navy" : "outline"} onClick={() => setAction(a.key)}>
                {a.label}
              </ActionButton>
            ))}
          </div>

          {action ? (
            <div className="space-y-3 rounded-xl border border-border p-4">
              {action === "assign" || action === "reassign" ? (
                partner ? (
                  <p className="text-sm">
                    Partner: <span className="font-bold">{partner.displayName}</span>{" "}
                    <button type="button" onClick={() => setPartner(null)} className="text-xs font-bold text-primary hover:underline">
                      change
                    </button>
                  </p>
                ) : (
                  <PartnerPicker onPick={setPartner} />
                )
              ) : null}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason (required, recorded in the history)"
                className="w-full rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <ActionButton size="sm" variant="primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Confirm"}
                </ActionButton>
                <button type="button" onClick={() => setAction(null)} className="text-sm font-semibold text-muted-foreground hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {r ? (
            <div>
              <p className="mb-2 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">History</p>
              <ul className="space-y-2">
                {r.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="font-semibold">{e.event.toLowerCase()}</span>
                    {e.fromStatus && e.toStatus ? <span className="text-muted-foreground"> · {e.fromStatus} → {e.toStatus}</span> : null}
                    <span className="text-muted-foreground"> · {e.actorType === "ADMIN" ? e.actorLabel : e.actorType.toLowerCase()} · {fmt(e.createdAt)}</span>
                    {e.reason ? <p className="text-xs text-foreground/80">Reason: {e.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Recent() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: RecentReferral[]; total: number } | null>(null);
  useEffect(() => {
    setData(null);
    adminReferralsApi
      .recent(page)
      .then(setData)
      .catch(() => setData({ items: [], total: 0 }));
  }, [page]);
  return (
    <>
      <TableShell>
        <thead>
          <tr>
            <Th>Linked</Th>
            <Th>Patient</Th>
            <Th>Referred by</Th>
            <Th>Source</Th>
            <Th>Bookings</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {!data ? (
            <TableLoadingState colSpan={6} />
          ) : data.items.length === 0 ? (
            <TableEmptyState icon={Share2} message="No referrals yet." colSpan={6} />
          ) : (
            data.items.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-muted/40">
                <Td className="whitespace-nowrap text-muted-foreground">{fmt(r.boundAt)}</Td>
                <Td className="whitespace-nowrap">
                  <p className="font-semibold">{r.user.name || "(no name)"}</p>
                  <p className="text-xs text-muted-foreground">{r.user.phone}</p>
                </Td>
                <Td>
                  <Link to="/admin/partners/$partnerId" params={{ partnerId: r.partner.id }} className="font-semibold text-primary hover:underline">
                    {r.partner.displayName}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">{r.source.toLowerCase()}</Td>
                <Td>{r._count.orderAttributions}</Td>
                <Td>
                  <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {data ? <AdminPagination page={page} pageCount={Math.max(1, Math.ceil(data.total / 20))} pageSize={20} total={data.total} onPageChange={setPage} /> : null}
    </>
  );
}

function Attempts() {
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<AttemptOutcome | "">("");
  const [data, setData] = useState<{ items: ReferralAttemptRow[]; total: number } | null>(null);
  useEffect(() => {
    setData(null);
    adminReferralsApi
      .attempts(page, outcome || undefined)
      .then(setData)
      .catch(() => setData({ items: [], total: 0 }));
  }, [page, outcome]);
  return (
    <>
      <select
        value={outcome}
        onChange={(e) => {
          setOutcome(e.target.value as AttemptOutcome | "");
          setPage(1);
        }}
        className={`${inputClass} mb-4`}
      >
        <option value="">All outcomes</option>
        {(Object.keys(ATTEMPT_LABELS) as AttemptOutcome[]).map((o) => (
          <option key={o} value={o}>
            {ATTEMPT_LABELS[o]}
          </option>
        ))}
      </select>
      <TableShell>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Outcome</Th>
            <Th>Code</Th>
            <Th>Partner</Th>
            <Th>Patient</Th>
          </tr>
        </thead>
        <tbody>
          {!data ? (
            <TableLoadingState colSpan={5} />
          ) : data.items.length === 0 ? (
            <TableEmptyState icon={Activity} message="No attempts recorded." colSpan={5} />
          ) : (
            data.items.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-muted/40">
                <Td className="whitespace-nowrap text-muted-foreground">{fmt(a.createdAt)}</Td>
                <Td>
                  <StatusBadge tone={a.outcome === "BOUND" ? "success" : a.outcome === "SELF_REFERRAL" ? "danger" : "neutral"}>{ATTEMPT_LABELS[a.outcome]}</StatusBadge>
                </Td>
                <Td className="font-mono text-xs">{a.codeAttempted}</Td>
                <Td>{a.partner?.displayName ?? "—"}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{a.user?.phone ?? "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {data ? <AdminPagination page={page} pageCount={Math.max(1, Math.ceil(data.total / 30))} pageSize={30} total={data.total} onPageChange={setPage} /> : null}
    </>
  );
}

function Health() {
  const [health, setHealth] = useState<ReferralHealth | null>(null);
  const [message, setMessage] = useState("");
  const load = () =>
    adminReferralsApi
      .health()
      .then(setHealth)
      .catch((err) => setMessage(errText(err, "Couldn't load")));
  useEffect(() => {
    load();
  }, []);

  async function retry(orderId: string) {
    try {
      const res = await adminReferralsApi.retry(orderId);
      setMessage(res.reason);
      await load();
    } catch (err) {
      setMessage(errText(err, "Retry failed"));
    }
  }

  if (!health) return <p className="text-sm text-muted-foreground">{message || "Loading…"}</p>;
  const hb = health.heartbeat;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Tracking" value={health.enabled ? "On" : "Off"} />
        <Tile label="Last successful run" value={fmt(hb?.lastSuccessAt)} />
        <Tile label="Bookings waiting > 5 min" value={String(hb?.lastBacklog ?? 0)} />
      </div>
      {health.enabled && health.stale ? (
        <p className="flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm font-semibold text-warning">
          <AlertTriangle className="h-4 w-4" /> No successful run in the last 15 minutes — new bookings are waiting to be attributed (they are not affected otherwise).
        </p>
      ) : null}
      {hb?.lastError ? <p className="text-xs text-destructive">Last error: {hb.lastError}</p> : null}
      <p className="text-sm text-muted-foreground">{health.retrying} booking(s) being retried automatically.</p>
      {health.needsAttention.length > 0 ? (
        <TableShell>
          <thead>
            <tr>
              <Th>Booking</Th>
              <Th>Attempts</Th>
              <Th>Last error</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {health.needsAttention.map((f) => (
              <tr key={f.orderId}>
                <Td>
                  <Link to="/admin/bookings/$orderId" params={{ orderId: f.orderId }} className="font-mono text-xs text-primary hover:underline">
                    {f.orderId}
                  </Link>
                </Td>
                <Td>{f.attempts}</Td>
                <Td className="max-w-xs text-xs text-muted-foreground">{f.lastError}</Td>
                <Td>
                  <ActionButton size="sm" variant="outline" onClick={() => retry(f.orderId)}>
                    Retry
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
      )}
      {message ? <p className="text-sm font-semibold">{message}</p> : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-lg font-extrabold">{value}</p>
    </div>
  );
}
