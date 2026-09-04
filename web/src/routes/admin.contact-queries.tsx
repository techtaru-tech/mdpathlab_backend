import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminContactQueriesApi, type AdminContactQuery } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/contact-queries")({
  head: () => ({ meta: [{ title: "Contact Queries — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminContactQueriesPage,
});

const PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminContactQueriesPage() {
  const [queries, setQueries] = useState<AdminContactQuery[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminContactQueriesApi
      .list()
      .then(setQueries)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(q: AdminContactQuery) {
    setSavingId(q.id);
    try {
      const updated = await adminContactQueriesApi.updateStatus(q.id, q.status === "NEW" ? "CONTACTED" : "NEW");
      setQueries((prev) => prev.map((x) => (x.id === q.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return queries;
    const q = search.trim().toLowerCase();
    return queries.filter((item) =>
      [item.name, item.phone, item.email, item.message].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [queries, search]);

  const newCount = queries.filter((q) => q.status === "NEW").length;
  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, search);

  return (
    <AdminLayout activePath="/admin/contact-queries">
      <AdminPageHeader
        title="Contact Queries"
        description={`${queries.length} submission${queries.length === 1 ? "" : "s"} · ${newCount} new`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email or message"
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
              <Th>Message</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={MessageSquare} message="No contact queries yet." colSpan={5} />
            ) : (
              paged.map((q) => (
                <tr key={q.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(q.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{q.name}</Td>
                  <Td className="whitespace-nowrap">
                    <p>{q.phone}</p>
                    {q.email ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /> {q.email}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-foreground/85">{q.message}</p>
                  </Td>
                  <Td>
                    <button onClick={() => toggleStatus(q)} disabled={savingId === q.id} className="disabled:opacity-60">
                      <StatusBadge tone={q.status === "NEW" ? "warning" : "success"}>{q.status === "NEW" ? "New" : "Contacted"}</StatusBadge>
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
