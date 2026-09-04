import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, TestTube } from "lucide-react";
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
  adminTestsApi,
  type AdminCategory,
  type AdminParameter,
  type AdminTest,
  type TestFormDto,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/catalogue/tests")({
  head: () => ({ meta: [{ title: "Tests — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminTestsPage,
});

const emptyForm: TestFormDto = {
  testCode: "",
  name: "",
  categoryId: "",
  shortDescription: "",
  sampleType: "",
  preparationInstructions: "",
  mrp: 0,
  price: 0,
  sampleCollection: "HOME",
  reportTimeHours: 24,
  fastingRequired: false,
  fastingHours: undefined,
  tag: "",
  parameterIds: [],
};

const PAGE_SIZE = 10;

function AdminTestsPage() {
  const [list, setList] = useState<AdminTest[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [parameters, setParameters] = useState<AdminParameter[]>([]);
  const [parameterSearch, setParameterSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TestFormDto>(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(params?: { search?: string; status?: string }) {
    setLoading(true);
    adminTestsApi
      .list(params)
      .then(setList)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    adminCategoriesApi.list().then(setCategories);
    adminParametersApi.list().then(setParameters);
  }, []);

  const filteredParameters = useMemo(
    () => parameters.filter((p) => p.name.toLowerCase().includes(parameterSearch.trim().toLowerCase())),
    [parameters, parameterSearch],
  );

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(t: AdminTest) {
    setEditingId(t.id);
    setForm({
      testCode: t.testCode,
      name: t.name,
      slug: t.slug,
      categoryId: t.categoryId ?? "",
      shortDescription: t.shortDescription ?? "",
      sampleType: t.sampleType ?? "",
      preparationInstructions: t.preparationInstructions ?? "",
      mrp: t.mrp,
      price: t.price,
      sampleCollection: t.sampleCollection,
      reportTimeHours: t.reportTimeHours,
      fastingRequired: t.fastingRequired,
      fastingHours: t.fastingHours ?? undefined,
      status: t.status,
      tag: t.tag ?? "",
      parameterIds: t.parameters.map((pp) => pp.parameterId),
    });
    setError("");
    setShowForm(true);
  }

  function toggleParameter(id: string) {
    setForm((f) => ({
      ...f,
      parameterIds: f.parameterIds?.includes(id) ? f.parameterIds.filter((x) => x !== id) : [...(f.parameterIds ?? []), id],
    }));
  }

  async function handleSave() {
    setError("");
    const dto: TestFormDto = {
      ...form,
      // null (not undefined) so editing an existing test can actually clear a previously-set
      // value — an omitted field means "leave unchanged", not "clear it".
      categoryId: form.categoryId || null,
      shortDescription: form.shortDescription || null,
      sampleType: form.sampleType || null,
      preparationInstructions: form.preparationInstructions || null,
      tag: form.tag || null,
      fastingHours: form.fastingRequired ? form.fastingHours : null,
    };
    try {
      if (editingId) {
        const updated = await adminTestsApi.update(editingId, dto);
        setList((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await adminTestsApi.create(dto);
        setList((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save test");
    }
  }

  async function toggleStatus(t: AdminTest) {
    setSavingId(t.id);
    try {
      const updated = await adminTestsApi.setStatus(t.id, t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      setList((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(t: AdminTest) {
    if (!window.confirm(`Delete test "${t.name}"?`)) return;
    try {
      await adminTestsApi.remove(t.id);
      setList((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      window.alert(err instanceof AdminApiError ? err.message : "Couldn't delete test");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(list, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/catalogue/tests">
      <AdminPageHeader
        title="Tests"
        description={`${list.length} customer-facing test bundle${list.length === 1 ? "" : "s"}`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add test
          </ActionButton>
        }
      />

      <div className="mt-4">
        <CsvImportPanel
          onDownloadTemplate={adminTestsApi.downloadTemplate}
          onDownloadExport={adminTestsApi.downloadExport}
          onPreview={adminTestsApi.previewCsv}
          onImport={adminTestsApi.importCsv}
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
            placeholder="Test code (e.g. CBC001)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Test name (e.g. Complete Blood Count)"
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
            value={form.sampleType ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, sampleType: e.target.value }))}
            placeholder="Sample type (e.g. Blood)"
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
            placeholder="Preparation instructions (optional)"
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
            onChange={(e) => setForm((f) => ({ ...f, sampleCollection: e.target.value as TestFormDto["sampleCollection"] }))}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
          >
            <option value="HOME">Home collection</option>
            <option value="LAB">Lab visit</option>
            <option value="BOTH">Home or lab</option>
          </select>
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
            placeholder="Marketing tag (optional)"
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

          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Parameters covered</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={parameterSearch}
                onChange={(e) => setParameterSearch(e.target.value)}
                placeholder="Search parameters (e.g. Haemoglobin)"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
              {filteredParameters.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No parameters match.</p>
              ) : (
                filteredParameters.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={form.parameterIds?.includes(p.id) ?? false}
                      onChange={() => toggleParameter(p.id)}
                    />
                    {p.name}
                    {p.code ? <span className="text-xs text-muted-foreground">({p.code})</span> : null}
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{form.parameterIds?.length ?? 0} selected</p>
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
              <Th>Test Code</Th>
              <Th>Test Name</Th>
              <Th>Category</Th>
              <Th>Parameters</Th>
              <Th>MRP</Th>
              <Th>Selling Price</Th>
              <Th>Collection</Th>
              <Th>Report Time</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={10} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={TestTube} message="No tests found." colSpan={10} />
            ) : (
              paged.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap font-semibold">{t.testCode}</Td>
                  <Td>{t.name}</Td>
                  <Td className="text-muted-foreground">{t.category?.name ?? "—"}</Td>
                  <Td className="text-muted-foreground">{t.parameters.length}</Td>
                  <Td>₹{t.mrp}</Td>
                  <Td className="font-semibold">₹{t.price}</Td>
                  <Td className="text-muted-foreground">{t.sampleCollection}</Td>
                  <Td className="text-muted-foreground">{t.reportTimeHours}h</Td>
                  <Td>
                    <StatusBadge tone={t.status === "ACTIVE" ? "success" : "danger"}>{t.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => startEdit(t)} className="text-xs font-bold text-primary hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(t)}
                        disabled={savingId === t.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary disabled:opacity-60"
                      >
                        {t.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(t)} className="text-xs font-bold text-destructive hover:underline">
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
