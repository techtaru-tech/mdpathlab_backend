import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, UserX, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Avatar, TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminPatientsApi, type AdminPatient } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({ meta: [{ title: "Patients — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPatientsPage,
});

type SortKey = "phone" | "name" | "familyMembers" | "orders" | "createdAt";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AdminPatientsPage() {
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });

  function load(q?: string) {
    setLoading(true);
    setError("");
    adminPatientsApi
      .list(q)
      .then(setPatients)
      .catch(() => setError("Couldn't load patients"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(p: AdminPatient) {
    const next = p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const updated = await adminPatientsApi.updateStatus(p.id, next);
    setPatients((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
  }

  function handleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key: key as SortKey, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: key as SortKey, dir: "asc" }));
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...patients].sort((a, b) => {
      switch (sort.key) {
        case "phone":
          return a.phone.localeCompare(b.phone) * dir;
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "") * dir;
        case "familyMembers":
          return (a._count.familyMembers - b._count.familyMembers) * dir;
        case "orders":
          return (a._count.orders - b._count.orders) * dir;
        case "createdAt":
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
  }, [patients, sort]);

  return (
    <AdminLayout activePath="/admin/patients">
      <AdminPageHeader
        title="Patients"
        description={`${patients.length} patient${patients.length === 1 ? "" : "s"} loaded`}
        actions={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(search);
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone or name"
              className="w-44 bg-transparent text-sm focus:outline-none sm:w-56"
            />
          </form>
        }
      />

      {error ? <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="phone" activeSort={sort} onSort={handleSort}>Patient</Th>
              <Th sortKey="familyMembers" activeSort={sort} onSort={handleSort} align="right">Family</Th>
              <Th sortKey="orders" activeSort={sort} onSort={handleSort} align="right">Orders</Th>
              <Th sortKey="createdAt" activeSort={sort} onSort={handleSort}>Joined</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : sorted.length === 0 ? (
              <TableEmptyState icon={Users} message="No patients found." colSpan={6} />
            ) : (
              sorted.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar label={p.name ?? p.phone} />
                      <div className="min-w-0">
                        <p className="font-semibold whitespace-nowrap">{p.phone}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.name ?? "No name on file"}</p>
                      </div>
                    </div>
                  </Td>
                  <Td align="right">{p._count.familyMembers}</Td>
                  <Td align="right">{p._count.orders}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(p.createdAt)}</Td>
                  <Td>
                    <StatusBadge tone={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => toggleStatus(p)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-destructive/40 hover:text-destructive"
                    >
                      <UserX className="h-3.5 w-3.5" />
                      {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </AdminLayout>
  );
}
