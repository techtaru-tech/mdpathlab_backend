import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminCitiesApi, type AdminCity, type CityInput } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/cities")({
  head: () => ({ meta: [{ title: "Cities — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCitiesPage,
});

const emptyForm = { name: "", slug: "" };

function CityForm({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: typeof emptyForm;
  saving: boolean;
  error: string;
  onSave: (values: typeof emptyForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <input
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="City name (e.g. Delhi NCR)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.slug}
        onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        placeholder="Slug (optional — auto-generated from name)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton type="button" onClick={() => onSave(form)} variant="primary" size="sm" disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "Save city"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminCitiesPage() {
  const [cities, setCities] = useState<AdminCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminCitiesApi
      .list()
      .then(setCities)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function toInput(values: typeof emptyForm): CityInput {
    return { name: values.name.trim(), ...(values.slug.trim() ? { slug: values.slug.trim() } : {}) };
  }

  async function handleCreate(values: typeof emptyForm) {
    setSaving(true);
    setError("");
    try {
      const created = await adminCitiesApi.create(toInput(values));
      setCities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create city");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, values: typeof emptyForm) {
    setSaving(true);
    setError("");
    try {
      const updated = await adminCitiesApi.update(id, toInput(values));
      setCities((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update city");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(c: AdminCity) {
    setSavingStatusId(c.id);
    try {
      const updated = await adminCitiesApi.update(c.id, { name: c.name, isActive: !c.isActive });
      setCities((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } finally {
      setSavingStatusId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this city? This can't be undone.")) return;
    try {
      await adminCitiesApi.remove(id);
      setCities((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't delete city");
    }
  }

  return (
    <AdminLayout activePath="/admin/cities">
      <AdminPageHeader
        title="Cities"
        description={`${cities.length} cit${cities.length === 1 ? "y" : "ies"} · shown on the website's city picker and footer`}
        actions={
          <ActionButton
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setEditingId(null);
              setError("");
            }}
            variant={showCreate ? "outline" : "primary"}
            size="sm"
          >
            <Plus className="h-4 w-4" /> Add city
          </ActionButton>
        }
      />

      {showCreate ? (
        <CityForm
          initial={emptyForm}
          saving={saving}
          error={error}
          onSave={handleCreate}
          onCancel={() => {
            setShowCreate(false);
            setError("");
          }}
        />
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>City</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={4} />
            ) : cities.length === 0 ? (
              <TableEmptyState icon={Building2} message="No cities yet — add one to show it on the website." colSpan={4} />
            ) : (
              cities.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={4} className="border-b border-border p-4">
                      <CityForm
                        initial={{ name: c.name, slug: c.slug }}
                        saving={saving}
                        error={error}
                        onSave={(values) => handleUpdate(c.id, values)}
                        onCancel={() => {
                          setEditingId(null);
                          setError("");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <Td className="font-semibold whitespace-nowrap">{c.name}</Td>
                    <Td className="text-muted-foreground">{c.slug}</Td>
                    <Td>
                      <button onClick={() => toggleStatus(c)} disabled={savingStatusId === c.id} className="disabled:opacity-60">
                        <StatusBadge tone={c.isActive ? "success" : "danger"}>{c.isActive ? "Active" : "Inactive"}</StatusBadge>
                      </button>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(c.id);
                            setShowCreate(false);
                            setError("");
                          }}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-destructive/40 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </TableShell>
      </div>
    </AdminLayout>
  );
}
