import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Search } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PartnerApiError, partnerApi, type Affiliation, type AffiliationStatus, type ClinicSearchResult, type PartnerMe } from "@/lib/partner-api";

export const Route = createFileRoute("/partner/affiliations")({
  head: () => ({ meta: [{ title: "Clinic Affiliations — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerAffiliationsPage,
});

const STATUS: Record<AffiliationStatus, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  REQUESTED: { label: "Requested", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  REJECTED: { label: "Declined", tone: "danger" },
  ENDED: { label: "Ended", tone: "neutral" },
};

const errorText = (err: unknown, fallback: string) => (err instanceof PartnerApiError ? err.message : fallback);

function PartnerAffiliationsPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return <PartnerLayout activePath="/partner/affiliations">{enabled ? <Affiliations /> : null}</PartnerLayout>;
}

function Affiliations() {
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [rows, setRows] = useState<Affiliation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    partnerApi
      .me()
      .then((m) => {
        setMe(m);
        return m.status === "APPROVED" ? partnerApi.affiliations().then(setRows) : undefined;
      })
      .catch((err) => setError(errorText(err, "Couldn't load affiliations")));
  }, []);

  async function act(id: string, fn: () => Promise<Affiliation[]>) {
    setBusy(id);
    setError("");
    try {
      setRows(await fn());
    } catch (err) {
      setError(errorText(err, "That didn't work — please try again"));
    } finally {
      setBusy(null);
    }
  }

  if (!me) return error ? <p className="text-sm font-semibold text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;
  if (me.status !== "APPROVED") {
    return <p className="max-w-xl text-sm text-muted-foreground">Clinic affiliations are available once your application is approved.</p>;
  }

  const isDoctor = me.type === "DOCTOR";
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Clinic affiliations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDoctor
            ? "Ask to be listed at the clinics where you practise. The clinic confirms each request."
            : "Doctors who practise at your clinic can ask to be listed. Accept or decline their requests here."}
        </p>
      </div>

      {isDoctor ? <ClinicSearch existing={rows} onRequested={setRows} /> : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" /> {isDoctor ? "You haven't added any clinics yet." : "No requests yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold">{a.counterpart.name}</p>
                  <p className="text-xs text-muted-foreground">{[a.counterpart.detail, a.counterpart.city].filter(Boolean).join(" · ")}</p>
                  {a.note ? <p className="mt-1 text-xs text-muted-foreground">Note: {a.note}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusBadge>
                  {!isDoctor && a.status === "REQUESTED" ? (
                    <>
                      <ActionButton size="sm" variant="navy" disabled={busy !== null} onClick={() => act(a.id, () => partnerApi.acceptAffiliation(a.id))}>
                        Accept
                      </ActionButton>
                      <ActionButton size="sm" variant="outline" disabled={busy !== null} onClick={() => act(a.id, () => partnerApi.rejectAffiliation(a.id))}>
                        Decline
                      </ActionButton>
                    </>
                  ) : null}
                  {(isDoctor && a.status === "REQUESTED") || a.status === "ACTIVE" ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(a.status === "ACTIVE" ? "End this affiliation?" : "Withdraw this request?")) act(a.id, () => partnerApi.endAffiliation(a.id));
                      }}
                      className="text-xs font-bold text-destructive hover:underline disabled:opacity-50"
                    >
                      {a.status === "ACTIVE" ? "End" : "Withdraw"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function ClinicSearch({ existing, onRequested }: { existing: Affiliation[]; onRequested: (rows: Affiliation[]) => void }) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [results, setResults] = useState<ClinicSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = new Set(existing.filter((a) => a.status === "REQUESTED" || a.status === "ACTIVE").map((a) => a.counterpart.id));

  async function search() {
    if (q.trim().length < 2) {
      setError("Type at least 2 letters of the clinic name");
      return;
    }
    setError("");
    setBusy(true);
    try {
      setResults(await partnerApi.searchClinics(q.trim(), city.trim() || undefined));
    } catch (err) {
      setError(errorText(err, "Search failed"));
    } finally {
      setBusy(false);
    }
  }

  async function request(id: string) {
    setBusy(true);
    setError("");
    try {
      onRequested(await partnerApi.requestAffiliation(id));
    } catch (err) {
      setError(errorText(err, "Couldn't send the request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Clinic name" className="h-10 w-full bg-transparent text-sm focus:outline-none" />
        </div>
        <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="City (optional)" className="h-10 w-40 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none" />
        <ActionButton size="sm" variant="navy" onClick={search} disabled={busy}>
          Search
        </ActionButton>
      </div>
      {results ? (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No approved clinics match. Only clinics already registered and approved with MD Path Labs appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {results.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.type} · {c.city}
                  </p>
                </div>
                {open.has(c.id) ? (
                  <span className="text-xs font-semibold text-muted-foreground">Already requested</span>
                ) : (
                  <ActionButton size="sm" variant="outline" onClick={() => request(c.id)} disabled={busy}>
                    Request
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
