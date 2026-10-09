import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { LabApiError, labHomeVisitsApi, labPhlebotomistsApi, type HomeVisitStatus, type LabHomeVisit, type LabPhlebotomist } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/home-visits")({
  head: () => ({ meta: [{ title: "Home Visits — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabHomeVisitsPage,
});

const STATUSES: HomeVisitStatus[] = ["REQUESTED", "ASSIGNED", "ON_THE_WAY", "ARRIVED", "TESTS_ADDED", "COLLECTED", "COMPLETED", "CANCELLED", "NO_SHOW"];

function tone(status: HomeVisitStatus) {
  if (status === "REQUESTED") return "warning" as const;
  if (status === "CANCELLED" || status === "NO_SHOW") return "danger" as const;
  if (status === "COLLECTED" || status === "COMPLETED" || status === "TESTS_ADDED") return "success" as const;
  return "primary" as const;
}

const label = (status: HomeVisitStatus) => status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// Home visit requests routed to this lab by pincode. The lab assigns one of its own phlebotomists; the
// phlebotomist then marks on the way / arrived and adds the tests from the app, which creates the booking.
function LabHomeVisitsPage() {
  const [rows, setRows] = useState<LabHomeVisit[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<LabPhlebotomist[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    labHomeVisitsApi
      .list({ date, status })
      .then(setRows)
      .catch(() => setError("Couldn't load home visit requests"))
      .finally(() => setLoading(false));
  }, [date, status]);
  useEffect(() => {
    labPhlebotomistsApi.list().then(setPhlebotomists).catch(() => undefined);
  }, []);

  const active = useMemo(() => phlebotomists.filter((p) => p.status === "ACTIVE"), [phlebotomists]);
  const waiting = rows.filter((r) => r.status === "REQUESTED").length;

  async function run(id: string, action: () => Promise<LabHomeVisit>) {
    setBusyId(id);
    setError("");
    try {
      const updated = await action();
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function setStatusFor(r: LabHomeVisit, next: "ON_THE_WAY" | "ARRIVED" | "NO_SHOW" | "CANCELLED") {
    if ((next === "CANCELLED" || next === "NO_SHOW") && !window.confirm(`Mark this request as ${label(next)}?`)) return;
    void run(r.id, () => labHomeVisitsApi.setStatus(r.id, next));
  }

  const btn = "rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold hover:border-primary/40 hover:text-primary disabled:opacity-60";

  return (
    <LabLayout activePath="/lab/home-visits">
      <AdminPageHeader
        title="Home Visits"
        description={`${rows.length} request${rows.length === 1 ? "" : "s"} · ${waiting} waiting for a phlebotomist. Assign one of your phlebotomists; they add the tests from the app at the visit.`}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        {date || status ? (
          <button type="button" onClick={() => (setDate(""), setStatus(""))} className="text-xs font-bold text-primary hover:underline">
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}

      <div className="mt-4">
        <TableShell>
          <thead>
            <tr>
              <Th>Visit</Th>
              <Th>Patient</Th>
              <Th>Address</Th>
              <Th>Status</Th>
              <Th>Phlebotomist</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : rows.length === 0 ? (
              <TableEmptyState icon={Home} message="No home visit requests." colSpan={6} />
            ) : (
              rows.map((r) => {
                const busy = busyId === r.id;
                const open = ["REQUESTED", "ASSIGNED", "ON_THE_WAY", "ARRIVED"].includes(r.status);
                return (
                  <tr key={r.id} className="align-top transition-colors hover:bg-muted/40">
                    <Td className="whitespace-nowrap">
                      <p className="font-semibold">{r.preferredDate}</p>
                      <p className="text-xs text-muted-foreground">{r.windowLabel}</p>
                    </Td>
                    <Td>
                      <p className="font-semibold">{r.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.phone}
                        {r.age ? ` · ${r.age}y` : ""}
                        {r.gender ? ` · ${r.gender}` : ""}
                      </p>
                      {r.concern ? <p className="mt-1 max-w-xs text-xs text-muted-foreground">“{r.concern}”</p> : null}
                    </Td>
                    <Td className="max-w-xs text-xs text-muted-foreground">
                      {r.address}
                      <span className="block font-semibold text-foreground/80">
                        {r.city} {r.pincode}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge tone={tone(r.status)}>{label(r.status)}</StatusBadge>
                      {r.orderNumber ? <p className="mt-1 text-[11px] text-muted-foreground">Order {r.orderNumber}</p> : null}
                      {r.cancelReason ? <p className="mt-1 max-w-[12rem] text-[11px] text-muted-foreground">{r.cancelReason}</p> : null}
                    </Td>
                    <Td>
                      {open ? (
                        <select
                          value={r.phlebotomist?.id ?? ""}
                          disabled={busy || r.status === "ARRIVED" || r.status === "ON_THE_WAY"}
                          onChange={(e) => e.target.value && run(r.id, () => labHomeVisitsApi.assign(r.id, e.target.value))}
                          className="h-9 max-w-[11rem] rounded-lg border border-border bg-card px-2 text-xs font-semibold focus:outline-none disabled:opacity-60"
                        >
                          <option value="">{r.phlebotomist ? "Reassign…" : "Assign…"}</option>
                          {active.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.user.name ?? p.user.phone} ({p.employeeCode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs">{r.phlebotomist?.name ?? "—"}</span>
                      )}
                      {r.phlebotomist ? <p className="mt-1 text-[11px] text-muted-foreground">{r.phlebotomist.phone}</p> : null}
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {r.status === "ASSIGNED" ? (
                          <button className={btn} disabled={busy} onClick={() => setStatusFor(r, "ON_THE_WAY")}>
                            On the way
                          </button>
                        ) : null}
                        {r.status === "ASSIGNED" || r.status === "ON_THE_WAY" ? (
                          <button className={btn} disabled={busy} onClick={() => setStatusFor(r, "ARRIVED")}>
                            Arrived
                          </button>
                        ) : null}
                        {r.status === "ASSIGNED" || r.status === "ON_THE_WAY" || r.status === "ARRIVED" ? (
                          <button className={btn} disabled={busy} onClick={() => setStatusFor(r, "NO_SHOW")}>
                            No-show
                          </button>
                        ) : null}
                        {open ? (
                          <button className={`${btn} text-destructive`} disabled={busy} onClick={() => setStatusFor(r, "CANCELLED")}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      </div>
    </LabLayout>
  );
}
