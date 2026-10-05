import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Home, Plus, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  AdminApiError,
  adminHomeVisitsApi,
  adminPhlebotomistsApi,
  type AdminHomeVisit,
  type AdminPhlebotomist,
  type HomeVisitCatalogueItem,
  type HomeVisitStatus,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/home-visits")({
  head: () => ({ meta: [{ title: "Home Visits — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminHomeVisitsPage,
});

const PAGE_SIZE = 10;
const STATUSES: HomeVisitStatus[] = ["REQUESTED", "ASSIGNED", "ON_THE_WAY", "ARRIVED", "TESTS_ADDED", "COLLECTED", "COMPLETED", "CANCELLED", "NO_SHOW"];

function tone(status: HomeVisitStatus) {
  if (status === "REQUESTED") return "warning" as const;
  if (status === "CANCELLED" || status === "NO_SHOW") return "danger" as const;
  if (status === "COLLECTED" || status === "COMPLETED" || status === "TESTS_ADDED") return "success" as const;
  return "primary" as const;
}

function label(status: HomeVisitStatus) {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function AdminHomeVisitsPage() {
  const [rows, setRows] = useState<AdminHomeVisit[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<AdminPhlebotomist[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [addingFor, setAddingFor] = useState<AdminHomeVisit | null>(null);

  function load() {
    setLoading(true);
    adminHomeVisitsApi
      .list({ city: city.trim(), date, status })
      .then(setRows)
      .catch(() => setError("Couldn't load home visit requests"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [city, date, status]);
  useEffect(() => {
    adminPhlebotomistsApi.list().then(setPhlebotomists).catch(() => undefined);
  }, []);

  const activePhlebotomists = useMemo(() => phlebotomists.filter((p) => p.status === "ACTIVE"), [phlebotomists]);
  const { page, setPage, pageCount, paged, total } = usePagedList(rows, PAGE_SIZE, city + date + status);
  const pending = rows.filter((r) => r.status === "REQUESTED").length;

  async function run(id: string, action: () => Promise<AdminHomeVisit>) {
    setBusyId(id);
    setError("");
    try {
      const updated = await action();
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function setStatusFor(r: AdminHomeVisit, next: "ON_THE_WAY" | "ARRIVED" | "NO_SHOW" | "CANCELLED") {
    if ((next === "CANCELLED" || next === "NO_SHOW") && !window.confirm(`Mark this request as ${label(next)}?`)) return;
    void run(r.id, () => adminHomeVisitsApi.setStatus(r.id, next));
  }

  const btn = "rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold hover:border-primary/40 hover:text-primary disabled:opacity-60";

  return (
    <AdminLayout activePath="/admin/home-visits">
      <AdminPageHeader
        title="Home Visits"
        description={`${rows.length} request${rows.length === 1 ? "" : "s"} · ${pending} waiting for a phlebotomist. Customers asking for a phlebotomist to visit; add the tests once your phlebotomist has arrived to turn it into a normal booking.`}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="h-10 w-36 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        {city || date || status ? (
          <button
            type="button"
            onClick={() => {
              setCity("");
              setDate("");
              setStatus("");
            }}
            className="text-xs font-bold text-primary hover:underline"
          >
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
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Home} message="No home visit requests." colSpan={6} />
            ) : (
              paged.map((r) => {
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
                    </Td>
                    <Td>
                      {open ? (
                        <select
                          value={r.phlebotomist?.id ?? ""}
                          disabled={busy || r.status === "ARRIVED"}
                          onChange={(e) => e.target.value && run(r.id, () => adminHomeVisitsApi.assign(r.id, e.target.value))}
                          className="h-9 max-w-[11rem] rounded-lg border border-border bg-card px-2 text-xs font-semibold focus:outline-none"
                        >
                          <option value="">{r.phlebotomist ? "Reassign…" : "Assign…"}</option>
                          {activePhlebotomists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.user.name ?? p.user.phone} ({p.employeeCode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs">{r.phlebotomist?.name ?? "—"}</span>
                      )}
                      {open && r.phlebotomist ? <p className="mt-1 text-[11px] text-muted-foreground">{r.phlebotomist.phone}</p> : null}
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
                        {r.status === "ARRIVED" ? (
                          <button
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
                            disabled={busy}
                            onClick={() => setAddingFor(r)}
                          >
                            <Plus className="h-3 w-3" /> Add tests
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

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}

      {addingFor ? (
        <AddTestsDialog
          visit={addingFor}
          onClose={() => setAddingFor(null)}
          onDone={() => {
            setAddingFor(null);
            load();
          }}
        />
      ) : null}
    </AdminLayout>
  );
}

function AddTestsDialog({ visit, onClose, onDone }: { visit: AdminHomeVisit; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<HomeVisitCatalogueItem[]>([]);
  const [picked, setPicked] = useState<HomeVisitCatalogueItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      adminHomeVisitsApi.searchCatalogue(search.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const subtotal = picked.reduce((sum, i) => sum + i.price, 0);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await adminHomeVisitsApi.addItems(
        visit.id,
        picked.map((i) => ({ itemType: i.itemType, itemId: i.id })),
      );
      onDone();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't add tests");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold">Add tests</h2>
            <p className="text-xs text-muted-foreground">
              {visit.patientName} · {visit.preferredDate}. This creates a normal booking (pay on collection).
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a test or package (min 2 letters)"
          className="mt-4 h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />

        {results.length > 0 ? (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
            {results.map((r) => {
              const already = picked.some((p) => p.id === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={already}
                  onClick={() => setPicked((prev) => [...prev, r])}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">
                    {r.title} <span className="text-[10px] font-bold text-muted-foreground uppercase">{r.itemType === "PACKAGE" ? "Package" : "Test"}</span>
                  </span>
                  <span className="shrink-0 font-bold">₹{r.price}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {picked.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tests added yet.</p>
          ) : (
            picked.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{p.title}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-bold">₹{p.price}</span>
                  <button type="button" onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} aria-label="Remove">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        {picked.length > 0 ? <p className="mt-3 text-right text-sm font-extrabold">Subtotal ₹{subtotal}</p> : null}
        {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">
            Cancel
          </button>
          <button
            type="button"
            disabled={picked.length === 0 || saving}
            onClick={save}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Creating booking…" : "Create booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
