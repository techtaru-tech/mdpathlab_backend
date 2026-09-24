import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { labCatalogueApi, type LabCatalogueItem } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/catalogue")({
  head: () => ({ meta: [{ title: "Tests & Packages — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabCataloguePage,
});

function key(item: { itemType: string; itemId: string }) {
  return `${item.itemType}:${item.itemId}`;
}

function LabCataloguePage() {
  const [available, setAvailable] = useState<LabCatalogueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    labCatalogueApi
      .get()
      .then((res) => {
        setAvailable(res.available);
        setSelected(new Set(res.selected.map(key)));
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(item: LabCatalogueItem) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const items = Array.from(selected).map((k) => {
        const [itemType, itemId] = k.split(":") as [LabCatalogueItem["itemType"], string];
        return { itemType, itemId };
      });
      await labCatalogueApi.set(items);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const filtered = available.filter((i) => i.name?.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <LabLayout activePath="/lab/catalogue">
      <AdminPageHeader
        title="Tests & Packages"
        description={`${selected.size} of ${available.length} item(s) selected — only these show up as available at your lab when a customer books.`}
        actions={
          <ActionButton type="button" onClick={handleSave} variant="primary" size="sm" disabled={saving || loading}>
            {saving ? "Saving…" : saved ? <Check className="h-4 w-4" /> : "Save"}
          </ActionButton>
        }
      />

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests, packages, parameters…"
            className="mt-4 h-11 w-full max-w-md rounded-lg border border-border bg-card px-3 text-sm shadow-sm focus:outline-none"
          />
          <div className="mt-4 grid gap-1.5 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((i) => (
              <label key={key(i)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.has(key(i))} onChange={() => toggle(i)} />
                {i.name}
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {i.itemType === "PROFILE" ? "Test" : i.itemType === "PACKAGE" ? "Package" : "Parameter"}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </LabLayout>
  );
}
