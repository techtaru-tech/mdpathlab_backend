import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Scan, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminCategoriesApi,
  adminRadiologyApi,
  type AdminCategory,
  type AdminRadiology,
  type RadiologyFormDto,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/catalogue/radiology")({
  head: () => ({ meta: [{ title: "Radiology — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminRadiologyPage,
});

// Deliberately simple — no CSV import/export, no parameter bundling, no per-city pricing (unlike
// Tests/Packages). Radiology is a small, admin-just-adds-a-few-items catalogue: X-Ray, CT, MRI,
// Ultrasound, etc. Which partner labs actually offer each one is set separately, per lab, on the
// Labs page ("Tests/packages/radiology available at {lab}").
const emptyForm: RadiologyFormDto = {
  testCode: "",
  name: "",
  categoryId: "",
  shortDescription: "",
  modality: "",
  preparationInstructions: "",
  mrp: 0,
  price: 0,
  reportTimeHours: 24,
  fastingRequired: false,
  fastingHours: undefined,
  tag: "",
};

const PAGE_SIZE = 10;

function AdminRadiologyPage() {
  const [list, setList] = useState<AdminRadiology[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RadiologyFormDto>(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(params?: { search?: string; status?: string }) {
    setLoading(true);
    adminRadiologyApi
      .list(params)
      .then(setList)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    adminCategoriesApi.list().then(setCategories);
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(r: AdminRadiology) {
    setEditingId(r.id);
    setForm({
      testCode: r.testCode,
      name: r.name,
      slug: r.slug,
      categoryId: r.categoryId ?? "",
      shortDescription: r.shortDescription ?? "",
      modality: r.modality ?? "",
      preparationInstructions: r.preparationInstructions ?? "",
      mrp: r.mrp,
      price: r.price,
      reportTimeHours: r.reportTimeHours,
      fastingRequired: r.fastingRequired,
      fastingHours: r.fastingHours ?? undefined,
      status: r.status,
      tag: r.tag ?? "",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    const dto: RadiologyFormDto = {
      ...form,
      categoryId: form.categoryId || null,
      shortDescription: form.shortDescription || null,
      modality: form.modality || null,
      preparationInstructions: form.preparationInstructions || null,
      tag: form.tag || null,
      fastingHours: form.fastingRequired ? form.fastingHours : null,
    };
    try {
      if (editingId) {
        const updated = await adminRadiologyApi.update(editingId, dto);
        setList((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await adminRadiologyApi.create(dto);
        setList((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save radiology test");
    }
  }

  async function toggleStatus(r: AdminRadiology) {
    setSavingId(r.id);
    try {
      const updated = await adminRadiologyApi.setStatus(r.id, r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      setList((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(r: AdminRadiology) {
    if (!window.confirm(`Delete radiology test "${r.name}"?`)) return;
    try {
      await adminRadiologyApi.remove(r.id);
      setList((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      window.alert(err instanceof AdminApiError ? err.message : "Couldn't delete radiology test");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(list, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/catalogue/radiology">
      <AdminPageHeader
        title="Radiology"
        description={`${list.length} radiology/imaging service${list.length === 1 ? "" : "s"} — X-Ray, CT, MRI, Ultrasound, etc.`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add radiology test
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
            placeholder="Search name or test code"
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
            value={form.testCode}
            onChange={(e) => setForm((f) => ({ ...f, testCode: e.target.value }))}
            placeholder="Test code (e.g. XRAY001)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name (e.g. Chest X-Ray PA View)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <select
            value={form.categoryId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={form.modality ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value }))}
            placeholder="Modality (e.g. X-Ray, CT Scan, MRI, Ultrasound)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.shortDescription ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
            placeholder="Short description (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.preparationInstructions ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, preparationInstructions: e.target.value }))}
            placeholder="Preparation instructions (optional, e.g. remove metal objects)"
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
          <select
            value={form.status ?? "ACTIVE"}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="ACTIVE">Active — visible on /radiology</option>
            <option value="INACTIVE">Inactive — hidden</option>
          </select>
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
          <input
            value={form.tag ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
            placeholder="Marketing tag (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />

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
              <Th>Test Code</Th>
              <Th>Name</Th>
              <Th>Modality</Th>
              <Th>Category</Th>
              <Th>MRP</Th>
              <Th>Selling Price</Th>
              <Th>Report Time</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={9} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Scan} message="No radiology tests found." colSpan={9} />
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap font-semibold">{r.testCode}</Td>
                  <Td>{r.name}</Td>
                  <Td className="text-muted-foreground">{r.modality ?? "—"}</Td>
                  <Td className="text-muted-foreground">{r.category?.name ?? "—"}</Td>
                  <Td>₹{r.mrp}</Td>
                  <Td className="font-semibold">₹{r.price}</Td>
                  <Td className="text-muted-foreground">{r.reportTimeHours}h</Td>
                  <Td>
                    <StatusBadge tone={r.status === "ACTIVE" ? "success" : "danger"}>{r.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => startEdit(r)} className="text-xs font-bold text-primary hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(r)}
                        disabled={savingId === r.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary disabled:opacity-60"
                      >
                        {r.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(r)} className="text-xs font-bold text-destructive hover:underline">
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
