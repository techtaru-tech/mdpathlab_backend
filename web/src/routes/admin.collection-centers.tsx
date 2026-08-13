import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, MapPin, Phone, Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminCollectionCentersApi, type AdminCollectionCenter } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/collection-centers")({
  head: () => ({ meta: [{ title: "Collection Centers — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCollectionCentersPage,
});

type SortKey = "name" | "address" | "status";

function AdminCollectionCentersPage() {
  const [list, setList] = useState<AdminCollectionCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  useEffect(() => {
    adminCollectionCentersApi
      .list()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setError("");
    try {
      const created = await adminCollectionCentersApi.create(form);
      setList((prev) => [...prev, created]);
      setForm({ name: "", address: "", phone: "" });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create collection center");
    }
  }

  async function toggleStatus(c: AdminCollectionCenter) {
    setSavingId(c.id);
    try {
      const next = c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const updated = await adminCollectionCentersApi.updateStatus(c.id, next);
      setList((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  function handleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key: key as SortKey, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: key as SortKey, dir: "asc" }));
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "address":
          return a.address.localeCompare(b.address) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
      }
    });
  }, [list, sort]);

  return (
    <AdminLayout activePath="/admin/collection-centers">
      <AdminPageHeader
        title="Collection Centers"
        description={`${list.length} center${list.length === 1 ? "" : "s"}`}
        actions={
          <ActionButton type="button" onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add center
          </ActionButton>
        }
      />

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Center name"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Address"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Phone (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <ActionButton type="button" onClick={handleCreate} variant="primary" size="sm" className="sm:col-span-2">
            Save
          </ActionButton>
        </div>
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="name" activeSort={sort} onSort={handleSort}>Center</Th>
              <Th sortKey="address" activeSort={sort} onSort={handleSort}>Address</Th>
              <Th>Phone</Th>
              <Th sortKey="status" activeSort={sort} onSort={handleSort}>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : sorted.length === 0 ? (
              <TableEmptyState icon={Building2} message="No collection centers yet." colSpan={5} />
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <p className="font-semibold whitespace-nowrap">{c.name}</p>
                    </div>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {c.phone ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <StatusBadge tone={c.status === "ACTIVE" ? "success" : "danger"}>{c.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => toggleStatus(c)}
                      disabled={savingId === c.id}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                    >
                      {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
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
