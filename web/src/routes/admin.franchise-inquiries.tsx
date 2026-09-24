import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminFranchiseInquiriesApi, type AdminFranchiseInquiry } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/franchise-inquiries")({
  head: () => ({ meta: [{ title: "Franchise Inquiries — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminFranchiseInquiriesPage,
});

const PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminFranchiseInquiriesPage() {
  const [inquiries, setInquiries] = useState<AdminFranchiseInquiry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminFranchiseInquiriesApi
      .list()
      .then(setInquiries)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(inq: AdminFranchiseInquiry) {
    setSavingId(inq.id);
    try {
      const updated = await adminFranchiseInquiriesApi.updateStatus(inq.id, inq.status === "NEW" ? "CONTACTED" : "NEW");
      setInquiries((prev) => prev.map((x) => (x.id === inq.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return inquiries;
    const q = search.trim().toLowerCase();
    return inquiries.filter((item) =>
      [item.name, item.phone, item.email, item.city, item.investmentCapacity, item.message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [inquiries, search]);

  const newCount = inquiries.filter((i) => i.status === "NEW").length;
  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, search);

  return (
    <AdminLayout activePath="/admin/franchise-inquiries">
      <AdminPageHeader
        title="Franchise Inquiries"
        description={`${inquiries.length} submission${inquiries.length === 1 ? "" : "s"} · ${newCount} new`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email or city"
              className="w-48 bg-transparent text-sm focus:outline-none sm:w-64"
            />
          </div>
        }
      />

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Submitted</Th>
              <Th>Name</Th>
              <Th>Contact</Th>
              <Th>City</Th>
              <Th>Investment</Th>
              <Th>Message</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Building2} message="No franchise inquiries yet." colSpan={7} />
            ) : (
              paged.map((inq) => (
                <tr key={inq.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(inq.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{inq.name}</Td>
                  <Td className="whitespace-nowrap">
                    <p>{inq.phone}</p>
                    {inq.email ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /> {inq.email}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{inq.city}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{inq.investmentCapacity}</Td>
                  <Td className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-foreground/85">{inq.message ?? "—"}</p>
                  </Td>
                  <Td>
                    <button onClick={() => toggleStatus(inq)} disabled={savingId === inq.id} className="disabled:opacity-60">
                      <StatusBadge tone={inq.status === "NEW" ? "warning" : "success"}>{inq.status === "NEW" ? "New" : "Contacted"}</StatusBadge>
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
