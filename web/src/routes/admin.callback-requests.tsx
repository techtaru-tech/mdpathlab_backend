import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminCallbackRequestsApi, type AdminCallbackRequest } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/callback-requests")({
  head: () => ({ meta: [{ title: "Callback Requests — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCallbackRequestsPage,
});

const PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminCallbackRequestsPage() {
  const [requests, setRequests] = useState<AdminCallbackRequest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminCallbackRequestsApi
      .list()
      .then(setRequests)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(r: AdminCallbackRequest) {
    setSavingId(r.id);
    try {
      const updated = await adminCallbackRequestsApi.updateStatus(r.id, r.status === "NEW" ? "CONTACTED" : "NEW");
      setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.trim().toLowerCase();
    return requests.filter((r) => r.phone.includes(q));
  }, [requests, search]);

  const newCount = requests.filter((r) => r.status === "NEW").length;
  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, search);

  return (
    <AdminLayout activePath="/admin/callback-requests">
      <AdminPageHeader
        title="Callback Requests"
        description={`${requests.length} request${requests.length === 1 ? "" : "s"} · ${newCount} new`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone"
              className="w-40 bg-transparent text-sm focus:outline-none"
            />
          </div>
        }
      />

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Requested</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={3} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={PhoneCall} message="No callback requests yet." colSpan={3} />
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{r.phone}</Td>
                  <Td>
                    <button onClick={() => toggleStatus(r)} disabled={savingId === r.id} className="disabled:opacity-60">
                      <StatusBadge tone={r.status === "NEW" ? "warning" : "success"}>{r.status === "NEW" ? "New" : "Contacted"}</StatusBadge>
                    </button>
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
