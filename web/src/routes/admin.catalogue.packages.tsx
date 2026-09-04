import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Package, Plus, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminPackagesApi,
  adminParametersApi,
  adminTestsApi,
  type AdminPackage,
  type AdminParameter,
  type AdminTest,
  type PackageFormDto,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/catalogue/packages")({
  head: () => ({ meta: [{ title: "Packages — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPackagesPage,
});

type PickableItem = { itemType: "PARAMETER" | "PROFILE"; id: string; name: string };

const emptyForm: PackageFormDto = {
  name: "",
  subtitle: "",
  mrp: 0,
  price: 0,
  reportTimeHours: 24,
  fastingRequired: false,
  fastingHours: undefined,
  bestFor: "",
  badge: "",
  highlights: [],
  isFeatured: false,
  items: [],
};

const PAGE_SIZE = 10;

function AdminPackagesPage() {
  const [list, setList] = useState<AdminPackage[]>([]);
  const [parameters, setParameters] = useState<AdminParameter[]>([]);
  const [tests, setTests] = useState<AdminTest[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PackageFormDto>(emptyForm);
  const [highlightsText, setHighlightsText] = useState("");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(params?: { search?: string; status?: string }) {
    setLoading(true);
    adminPackagesApi
      .list(params)
      .then(setList)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    adminParametersApi.list().then(setParameters);
    adminTestsApi.list().then(setTests);
  }, []);

  const pickableItems = useMemo<PickableItem[]>(
    () => [
      ...tests.map((t) => ({ itemType: "PROFILE" as const, id: t.id, name: t.name })),
      ...parameters.map((p) => ({ itemType: "PARAMETER" as const, id: p.id, name: p.name })),
    ],
    [tests, parameters],
  );

  const filteredItems = useMemo(
    () => pickableItems.filter((i) => i.name.toLowerCase().includes(itemSearch.trim().toLowerCase())),
    [pickableItems, itemSearch],
  );

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setHighlightsText("");
    setError("");
    setShowForm(true);
  }

  function startEdit(p: AdminPackage) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle ?? "",
      mrp: p.mrp,
      price: p.price,
      reportTimeHours: p.reportTimeHours,
      fastingRequired: p.fastingRequired,
      fastingHours: p.fastingHours ?? undefined,
      bestFor: p.bestFor ?? "",
      badge: p.badge ?? "",
      highlights: p.highlights,
      isFeatured: p.isFeatured,
      status: p.status,
      items: p.items.map((i) => ({ itemType: i.itemType, itemId: (i.itemType === "PARAMETER" ? i.parameter?.id : i.profile?.id) ?? "" })),
    });
    setHighlightsText(p.highlights.join("\n"));
    setError("");
    setShowForm(true);
  }

  function isSelected(itemType: "PARAMETER" | "PROFILE", id: string) {
    return form.items?.some((i) => i.itemType === itemType && i.itemId === id) ?? false;
  }

  function toggleItem(itemType: "PARAMETER" | "PROFILE", id: string) {
    setForm((f) => {
      const items = f.items ?? [];
      const exists = items.some((i) => i.itemType === itemType && i.itemId === id);
      return { ...f, items: exists ? items.filter((i) => !(i.itemType === itemType && i.itemId === id)) : [...items, { itemType, itemId: id }] };
    });
  }

  function clearItems() {
    setForm((f) => ({ ...f, items: [] }));
  }

  async function handleSave() {
    setError("");
    const dto: PackageFormDto = {
      ...form,
      subtitle: form.subtitle || null,
      bestFor: form.bestFor || null,
      badge: form.badge || null,
      fastingHours: form.fastingRequired ? form.fastingHours : null,
      highlights: highlightsText
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
    };
    try {
      if (editingId) {
        const updated = await adminPackagesApi.update(editingId, dto);
        setList((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await adminPackagesApi.create(dto);
        setList((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save package");
    }
  }

  async function toggleStatus(p: AdminPackage) {
    setSavingId(p.id);
    try {
      const updated = await adminPackagesApi.setStatus(p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      setList((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(p: AdminPackage) {
    if (!window.confirm(`Delete package "${p.name}"?`)) return;
    try {
      await adminPackagesApi.remove(p.id);
      setList((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      window.alert(err instanceof AdminApiError ? err.message : "Couldn't delete package");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(list, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/catalogue/packages">
      <AdminPageHeader
        title="Packages"
        description={`${list.length} package${list.length === 1 ? "" : "s"}`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add package
          </ActionButton>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load({ search, status: statusFilter });
        }}
        className="mt-4 flex flex-wrap items-center gap-3"
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name"
            className="w-44 bg-transparent text-sm focus:outline-none sm:w-56"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            load({ search, status: e.target.value });
          }}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <ActionButton type="submit" variant="outline" size="sm">
          Search
        </ActionButton>
      </form>

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Package name"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.subtitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Subtitle (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            type="number"
            value={form.mrp}
            onChange={(e) => setForm((f) => ({ ...f, mrp: Number(e.target.value) }))}
            placeholder="MRP"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            placeholder="Selling price"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            type="number"
            value={form.reportTimeHours}
            onChange={(e) => setForm((f) => ({ ...f, reportTimeHours: Number(e.target.value) }))}
            placeholder="Report time (hours)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.bestFor ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, bestFor: e.target.value }))}
            placeholder="Best for (e.g. Age 18-35)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.badge ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
            placeholder="Badge (optional, e.g. Most popular)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.fastingRequired ?? false}
              onChange={(e) => setForm((f) => ({ ...f, fastingRequired: e.target.checked }))}
            />
            Fasting required
          </label>
          {form.fastingRequired ? (
            <input
              type="number"
              value={form.fastingHours ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, fastingHours: Number(e.target.value) }))}
              placeholder="Fasting hours"
              className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.isFeatured ?? false}
              onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))}
            />
            Featured
          </label>
          <select
            value={form.status ?? "ACTIVE"}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="ACTIVE">Active — visible on /packages</option>
            <option value="INACTIVE">Inactive — hidden</option>
          </select>
          <textarea
            value={highlightsText}
            onChange={(e) => setHighlightsText(e.target.value)}
            placeholder="Highlights — one bullet per line"
            rows={4}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none sm:col-span-2"
          />

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Included items</p>
              {form.items?.length ? (
                <button type="button" onClick={clearItems} className="text-xs font-bold text-destructive hover:underline">
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search tests and parameters"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
              {filteredItems.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No items match.</p>
              ) : (
                filteredItems.map((i) => (
                  <label key={`${i.itemType}:${i.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={isSelected(i.itemType, i.id)} onChange={() => toggleItem(i.itemType, i.id)} />
                    {i.name}
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      {i.itemType === "PROFILE" ? "Test" : "Parameter"}
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{form.items?.length ?? 0} selected</p>
          </div>

          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <ActionButton type="button" onClick={handleSave} variant="primary" size="sm">
              Save
            </ActionButton>
            <ActionButton type="button" onClick={() => setShowForm(false)} variant="outline" size="sm">
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Included items</Th>
              <Th>MRP</Th>
              <Th>Selling Price</Th>
              <Th>Featured</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Package} message="No packages found." colSpan={7} />
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="font-semibold">{p.name}</Td>
                  <Td className="text-muted-foreground">{p.items.length}</Td>
                  <Td>₹{p.mrp}</Td>
                  <Td className="font-semibold">₹{p.price}</Td>
                  <Td>{p.isFeatured ? "Yes" : "—"}</Td>
                  <Td>
                    <StatusBadge tone={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => startEdit(p)} className="text-xs font-bold text-primary hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(p)}
                        disabled={savingId === p.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary disabled:opacity-60"
                      >
                        {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-xs font-bold text-destructive hover:underline">
                        Delete
                      </button>
                    </div>
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
