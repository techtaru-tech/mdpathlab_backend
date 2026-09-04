import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Beaker, Plus, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { CsvImportPanel } from "@/components/admin/CsvImportPanel";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminCategoriesApi,
  adminParametersApi,
  type AdminCategory,
  type AdminParameter,
  type ParameterFormDto,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/catalogue/parameters")({
  head: () => ({ meta: [{ title: "Parameters — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminParametersPage,
});

const emptyForm: ParameterFormDto = {
  name: "",
  code: "",
  categoryId: "",
  shortDescription: "",
  mrp: 0,
  price: 0,
  sampleCollection: "HOME",
  reportTimeHours: 24,
  fastingRequired: false,
  fastingHours: undefined,
  tag: "",
};

const PAGE_SIZE = 10;

function AdminParametersPage() {
  const [list, setList] = useState<AdminParameter[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ParameterFormDto>(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(params?: { search?: string; status?: string }) {
    setLoading(true);
    adminParametersApi
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
    // New parameters default to inactive — atomic markers shouldn't clutter the public /tests
    // listing by default; an admin can still flip this if the parameter is meant to be sold
    // standalone (e.g. HbA1c).
    setForm({ ...emptyForm, status: "INACTIVE" });
    setError("");
    setShowForm(true);
  }

  function startEdit(p: AdminParameter) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      code: p.code ?? "",
      slug: p.slug,
      categoryId: p.categoryId ?? "",
      shortDescription: p.shortDescription ?? "",
      mrp: p.mrp,
      price: p.price,
      sampleCollection: p.sampleCollection,
      sampleCollectionFee: p.sampleCollectionFee,
      reportTimeHours: p.reportTimeHours,
      fastingRequired: p.fastingRequired,
      fastingHours: p.fastingHours ?? undefined,
      status: p.status,
      tag: p.tag ?? "",
      displayParameterCount: p.displayParameterCount ?? undefined,
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    const dto: ParameterFormDto = {
      ...form,
      // null (not undefined) so editing an existing parameter can actually clear a
      // previously-set value — an omitted field means "leave unchanged", not "clear it".
      code: form.code || null,
      categoryId: form.categoryId || null,
      shortDescription: form.shortDescription || null,
      tag: form.tag || null,
      fastingHours: form.fastingRequired ? form.fastingHours : null,
    };
    try {
      if (editingId) {
        const updated = await adminParametersApi.update(editingId, dto);
        setList((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await adminParametersApi.create(dto);
        setList((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save parameter");
    }
  }

  async function toggleStatus(p: AdminParameter) {
    setSavingId(p.id);
    try {
      const updated = await adminParametersApi.setStatus(p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      setList((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(p: AdminParameter) {
    if (!window.confirm(`Delete parameter "${p.name}"?`)) return;
    try {
      await adminParametersApi.remove(p.id);
      setList((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      window.alert(err instanceof AdminApiError ? err.message : "Couldn't delete parameter");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(list, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/catalogue/parameters">
      <AdminPageHeader
        title="Parameters"
        description={`${list.length} atomic lab marker${list.length === 1 ? "" : "s"}`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add parameter
          </ActionButton>
        }
      />

      <div className="mt-4">
        <CsvImportPanel
          onDownloadTemplate={adminParametersApi.downloadTemplate}
          onDownloadExport={adminParametersApi.downloadExport}
          onPreview={adminParametersApi.previewCsv}
          onImport={adminParametersApi.importCsv}
          onImported={() => load({ search, status: statusFilter })}
        />
      </div>

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
            placeholder="Search name or code"
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
            placeholder="Name (e.g. Haemoglobin)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.code ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="Code (optional, e.g. HB)"
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
            value={form.shortDescription ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
            placeholder="Short description (optional)"
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
          <select
            value={form.sampleCollection}
            onChange={(e) => setForm((f) => ({ ...f, sampleCollection: e.target.value as ParameterFormDto["sampleCollection"] }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="HOME">Home collection</option>
            <option value="LAB">Lab visit</option>
            <option value="BOTH">Home or lab</option>
          </select>
          <input
            type="number"
            value={form.sampleCollectionFee ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, sampleCollectionFee: Number(e.target.value) }))}
            placeholder="Collection fee (₹, 0 if free)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            type="number"
            value={form.reportTimeHours}
            onChange={(e) => setForm((f) => ({ ...f, reportTimeHours: Number(e.target.value) }))}
            placeholder="Report time (hours)"
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
          <input
            value={form.tag ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
            placeholder="Marketing tag (optional, e.g. Trending)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <select
            value={form.status ?? "ACTIVE"}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="ACTIVE">Active — visible on /tests</option>
            <option value="INACTIVE">Inactive — hidden</option>
          </select>
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
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Beaker} message="No parameters found." colSpan={5} />
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap font-semibold">{p.code ?? "—"}</Td>
                  <Td>{p.name}</Td>
                  <Td className="text-muted-foreground">{p.category?.name ?? "—"}</Td>
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
