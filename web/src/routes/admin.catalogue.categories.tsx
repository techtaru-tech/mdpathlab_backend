import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Tags } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminCategoriesApi, adminImageSrc, type AdminCategory } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/catalogue/categories")({
  head: () => ({ meta: [{ title: "Categories — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCategoriesPage,
});

const emptyForm = { name: "", slug: "" };
const PAGE_SIZE = 10;

function AdminCategoriesPage() {
  const [list, setList] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  function load() {
    setLoading(true);
    adminCategoriesApi
      .list()
      .then(setList)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setImageFile(null);
    setError("");
    setShowForm(true);
  }

  function startEdit(c: AdminCategory) {
    setEditingId(c.id);
    setForm({ name: c.name, slug: c.slug });
    setImageFile(null);
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    try {
      let saved = editingId ? await adminCategoriesApi.update(editingId, form) : await adminCategoriesApi.create(form);
      if (imageFile) saved = await adminCategoriesApi.uploadImage(saved.id, imageFile);
      setList((prev) => (editingId ? prev.map((c) => (c.id === editingId ? saved : c)) : [...prev, saved]));
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save category");
    }
  }

  async function toggleStatus(c: AdminCategory) {
    setSavingId(c.id);
    try {
      const next = c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const updated = await adminCategoriesApi.update(c.id, { name: c.name, status: next });
      setList((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(c: AdminCategory) {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try {
      await adminCategoriesApi.remove(c.id);
      setList((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      window.alert(err instanceof AdminApiError ? err.message : "Couldn't delete category");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(list, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/catalogue/categories">
      <AdminPageHeader
        title="Categories"
        description={`${list.length} categor${list.length === 1 ? "y" : "ies"}`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add category
          </ActionButton>
        }
      />

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Category name (e.g. Hematology)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="Slug (optional — auto-generated from name)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <label className="flex items-center gap-3 text-xs font-semibold text-muted-foreground sm:col-span-2">
            {imageFile ? (
              <img src={URL.createObjectURL(imageFile)} alt="" className="h-12 w-12 rounded-lg border border-border object-contain" />
            ) : adminImageSrc(list.find((c) => c.id === editingId)?.imageUrl) ? (
              <img src={adminImageSrc(list.find((c) => c.id === editingId)?.imageUrl)!} alt="" className="h-12 w-12 rounded-lg border border-border object-contain" />
            ) : null}
            <span>
              Category image (SVG, PNG, JPEG or WebP, max 2 MB)
              <input
                type="file"
                accept="image/svg+xml,image/png,image/jpeg,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="mt-1 block text-xs"
              />
            </span>
          </label>
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
              <Th>Image</Th>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Tags} message="No categories yet." colSpan={5} />
            ) : (
              paged.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    {adminImageSrc(c.imageUrl) ? (
                      <img src={adminImageSrc(c.imageUrl)!} alt="" className="h-10 w-10 rounded-lg border border-border object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>
                    <p className="font-semibold">{c.name}</p>
                  </Td>
                  <Td className="text-muted-foreground">{c.slug}</Td>
                  <Td>
                    <StatusBadge tone={c.status === "ACTIVE" ? "success" : "danger"}>{c.status}</StatusBadge>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => startEdit(c)} className="text-xs font-bold text-primary hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(c)}
                        disabled={savingId === c.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary disabled:opacity-60"
                      >
                        {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(c)} className="text-xs font-bold text-destructive hover:underline">
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
