import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  AdminApiError,
  adminPincodeNotifyApi,
  adminServiceAreaRequestsApi,
  type AdminPincodeDemand,
  type AdminPincodeNotifyRequest,
  type AdminServiceAreaRequest,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/pincode-notify")({
  head: () => ({ meta: [{ title: "Service-Area Requests — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPincodeNotifyPage,
});

const PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Tab = "customers" | "demand" | "labs";
type StatusFilter = "ALL" | "PENDING" | "NOTIFIED";

function AdminPincodeNotifyPage() {
  const [tab, setTab] = useState<Tab>("customers");
  const [requests, setRequests] = useState<AdminPincodeNotifyRequest[]>([]);
  const [demand, setDemand] = useState<AdminPincodeDemand[]>([]);
  const [labRequests, setLabRequests] = useState<AdminServiceAreaRequest[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminPincodeNotifyApi.list(), adminPincodeNotifyApi.demand(), adminServiceAreaRequestsApi.list()])
      .then(([r, d, l]) => {
        setRequests(r);
        setDemand(d);
        setLabRequests(l);
      })
      .catch(() => setError("Couldn't load requests"))
      .finally(() => setLoading(false));
  }, []);

  const pendingCustomers = requests.filter((r) => r.status === "PENDING").length;
  const pendingLabs = labRequests.filter((r) => r.status === "PENDING").length;

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(
      (r) => (statusFilter === "ALL" || r.status === statusFilter) && (!q || r.phone.includes(q) || r.pincode.includes(q)),
    );
  }, [requests, search, statusFilter]);

  const filteredDemand = useMemo(() => {
    const q = search.trim();
    return demand.filter((d) => !q || d.pincode.includes(q));
  }, [demand, search]);

  const filteredLabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labRequests.filter(
      (r) =>
        (statusFilter === "ALL" || (statusFilter === "PENDING" ? r.status === "PENDING" : r.status !== "PENDING")) &&
        (!q || r.pincode.includes(q) || r.lab.name.toLowerCase().includes(q)),
    );
  }, [labRequests, search, statusFilter]);

  const rows = tab === "customers" ? filteredCustomers : tab === "demand" ? filteredDemand : filteredLabs;
  const { page, setPage, pageCount, paged, total } = usePagedList<unknown>(rows, PAGE_SIZE, search + tab + statusFilter);

  async function decide(r: AdminServiceAreaRequest, status: "APPROVED" | "REJECTED") {
    const verb = status === "APPROVED" ? `Approve ${r.lab.name} serving ${r.pincode}?` : `Reject this request from ${r.lab.name}?`;
    if (!window.confirm(verb)) return;
    setBusyId(r.id);
    setError("");
    try {
      const updated = await adminServiceAreaRequestsApi.decide(r.id, status);
      setLabRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      if (status === "APPROVED") {
        // Approving flips any waiting customers' requests for that pincode to NOTIFIED.
        const [reqs, dem] = await Promise.all([adminPincodeNotifyApi.list(), adminPincodeNotifyApi.demand()]);
        setRequests(reqs);
        setDemand(dem);
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update request");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "customers", label: "Customer requests", count: pendingCustomers },
    { id: "demand", label: "Demand by pincode" },
    { id: "labs", label: "Lab requests", count: pendingLabs },
  ];

  const colSpan = tab === "customers" ? 4 : tab === "demand" ? 5 : 6;

  return (
    <AdminLayout activePath="/admin/pincode-notify">
      <AdminPageHeader
        title="Service-Area Requests"
        description="Customers asking to be notified once we cover their pincode, and partner labs asking to start serving a new pincode. Approving a lab request adds the pincode to that lab and notifies every customer waiting on it."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "labs" ? "Lab or pincode" : tab === "demand" ? "Pincode" : "Phone or pincode"}
              className="w-48 bg-transparent text-sm focus:outline-none sm:w-64"
            />
          </div>
        }
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-extrabold text-warning">{t.count} pending</span> : null}
            </button>
          ))}
        </div>

        {tab !== "demand" ? (
          <div className="flex gap-2">
            {(["ALL", "PENDING", tab === "customers" ? "NOTIFIED" : "NOTIFIED"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                  statusFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70 hover:text-primary",
                )}
              >
                {f === "ALL" ? "All" : f === "PENDING" ? "Pending" : tab === "customers" ? "Notified" : "Decided"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}

      <div className="mt-4">
        <TableShell>
          <thead>
            {tab === "customers" ? (
              <tr>
                <Th>Requested</Th>
                <Th>Phone</Th>
                <Th>Pincode</Th>
                <Th>Status</Th>
              </tr>
            ) : tab === "demand" ? (
              <tr>
                <Th>Pincode</Th>
                <Th>Customers waiting</Th>
                <Th>Total requests</Th>
                <Th>Last request</Th>
                <Th>Covered by a lab?</Th>
              </tr>
            ) : (
              <tr>
                <Th>Requested</Th>
                <Th>Lab</Th>
                <Th>Pincode</Th>
                <Th>Note</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={colSpan} />
            ) : paged.length === 0 ? (
              <TableEmptyState
                icon={MapPin}
                message={tab === "labs" ? "No lab requests yet." : tab === "demand" ? "No customer demand yet." : "No service-area requests yet."}
                colSpan={colSpan}
              />
            ) : tab === "customers" ? (
              (paged as AdminPincodeNotifyRequest[]).map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{r.phone}</Td>
                  <Td className="whitespace-nowrap">{r.pincode}</Td>
                  <Td>
                    <StatusBadge tone={r.status === "PENDING" ? "warning" : "success"}>{r.status === "PENDING" ? "Pending" : "Notified"}</StatusBadge>
                  </Td>
                </tr>
              ))
            ) : tab === "demand" ? (
              (paged as AdminPincodeDemand[]).map((d) => (
                <tr key={d.pincode} className="transition-colors hover:bg-muted/40">
                  <Td className="font-semibold whitespace-nowrap">{d.pincode}</Td>
                  <Td>{d.pending}</Td>
                  <Td>{d.total}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{d.lastRequestedAt ? formatDateTime(d.lastRequestedAt) : "—"}</Td>
                  <Td>
                    <StatusBadge tone={d.covered ? "success" : "danger"}>{d.covered ? "Covered" : "Not covered"}</StatusBadge>
                  </Td>
                </tr>
              ))
            ) : (
              (paged as AdminServiceAreaRequest[]).map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                  <Td className="font-semibold">{r.lab.name}</Td>
                  <Td className="whitespace-nowrap">{r.pincode}</Td>
                  <Td className="max-w-xs text-muted-foreground">{r.note ?? "—"}</Td>
                  <Td>
                    <StatusBadge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>
                      {r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Rejected"}
                    </StatusBadge>
                  </Td>
                  <Td align="right">
                    {r.status === "PENDING" ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r, "APPROVED")}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r, "REJECTED")}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:border-destructive/40 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
