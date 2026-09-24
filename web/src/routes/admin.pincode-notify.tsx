import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminPincodeNotifyApi, type AdminPincodeNotifyRequest } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/pincode-notify")({
  head: () => ({ meta: [{ title: "Service-Area Requests — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPincodeNotifyPage,
});

const PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminPincodeNotifyPage() {
  const [requests, setRequests] = useState<AdminPincodeNotifyRequest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminPincodeNotifyApi.list().then(setRequests).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.trim().toLowerCase();
    return requests.filter((r) => r.phone.includes(q) || r.pincode.includes(q));
  }, [requests, search]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, search);

  return (
    <AdminLayout activePath="/admin/pincode-notify">
      <AdminPageHeader
        title="Service-Area Requests"
        description={`${requests.length} request${requests.length === 1 ? "" : "s"} · ${pendingCount} pending — customers asking to be notified once we cover their pincode. Register a Lab covering a pincode (Labs page) to auto-notify everyone waiting on it.`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Phone or pincode"
              className="w-48 bg-transparent text-sm focus:outline-none sm:w-64"
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
              <Th>Pincode</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={4} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={MapPin} message="No service-area requests yet." colSpan={4} />
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{r.phone}</Td>
                  <Td className="whitespace-nowrap">{r.pincode}</Td>
                  <Td>
                    <StatusBadge tone={r.status === "PENDING" ? "warning" : "success"}>{r.status === "PENDING" ? "Pending" : "Notified"}</StatusBadge>
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
