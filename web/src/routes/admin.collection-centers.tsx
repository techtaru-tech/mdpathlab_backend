import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminCollectionCentersApi, type AdminCollectionCenter } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/collection-centers")({
  head: () => ({ meta: [{ title: "Collection Centers — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCollectionCentersPage,
});

function AdminCollectionCentersPage() {
  const [list, setList] = useState<AdminCollectionCenter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    adminCollectionCentersApi.list().then(setList);
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

  return (
    <AdminLayout activePath="/admin/collection-centers">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Collection Centers</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Add center
        </button>
      </div>

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collection centers yet.</p>
        ) : (
          list.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm font-extrabold">{c.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.address}</p>
              {c.phone ? <p className="mt-1 text-xs text-muted-foreground">{c.phone}</p> : null}
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
