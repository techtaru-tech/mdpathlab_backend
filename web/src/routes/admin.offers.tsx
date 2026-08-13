import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImageOff, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminOffersApi, type AdminOffer, type OfferInput } from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/admin/offers")({
  head: () => ({ meta: [{ title: "Offers — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminOffersPage,
});

const emptyForm = { title: "", subtitle: "", ctaLabel: "Book Now", ctaLink: "", sortOrder: "0" };

function OfferForm({
  initial,
  requireImage,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: typeof emptyForm;
  requireImage: boolean;
  saving: boolean;
  error: string;
  onSave: (values: typeof emptyForm, image: File | null) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <input
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        placeholder="Offer title (e.g. Flat 20% off Full Body Checkup)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
      />
      <input
        value={form.subtitle}
        onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
        placeholder="Subtitle (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
      />
      <input
        value={form.ctaLabel}
        onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
        placeholder="Button label"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.ctaLink}
        onChange={(e) => setForm((f) => ({ ...f, ctaLink: e.target.value }))}
        placeholder="Link (e.g. /packages/full-body-checkup)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        type="number"
        value={form.sortOrder}
        onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
        placeholder="Sort order (lower shows first)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-semibold text-primary hover:bg-primary-soft">
        {image ? image.name : preview ? "Replace image" : "Upload image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setImage(file);
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>
      {preview ? (
        <div className="sm:col-span-2">
          <img src={preview} alt="Offer preview" className="h-32 w-full rounded-lg object-cover" />
        </div>
      ) : null}
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton
          type="button"
          onClick={() => onSave(form, image)}
          variant="primary"
          size="sm"
          disabled={saving || !form.title.trim() || (requireImage && !image)}
        >
          {saving ? "Saving…" : "Save offer"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminOffersPage() {
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminOffersApi
      .list()
      .then(setOffers)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function toInput(values: typeof emptyForm): OfferInput {
    return {
      title: values.title,
      ...(values.subtitle ? { subtitle: values.subtitle } : {}),
      ...(values.ctaLabel ? { ctaLabel: values.ctaLabel } : {}),
      ...(values.ctaLink ? { ctaLink: values.ctaLink } : {}),
      sortOrder: Number(values.sortOrder) || 0,
    };
  }

  async function handleCreate(values: typeof emptyForm, image: File | null) {
    if (!image) return;
    setSaving(true);
    setError("");
    try {
      const created = await adminOffersApi.create({ ...toInput(values), image });
      setOffers((prev) => [...prev, created]);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create offer");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, values: typeof emptyForm, image: File | null) {
    setSaving(true);
    setError("");
    try {
      const updated = await adminOffersApi.update(id, { ...toInput(values), ...(image ? { image } : {}) });
      setOffers((prev) => prev.map((o) => (o.id === id ? updated : o)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update offer");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(o: AdminOffer) {
    setSavingStatusId(o.id);
    try {
      const updated = await adminOffersApi.update(o.id, { title: o.title, status: o.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      setOffers((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
    } finally {
      setSavingStatusId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this offer? This can't be undone.")) return;
    await adminOffersApi.remove(id);
    setOffers((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <AdminLayout activePath="/admin/offers">
      <AdminPageHeader
        title="Offers"
        description={`${offers.length} offer${offers.length === 1 ? "" : "s"} · shown on the home page, lowest sort order first`}
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
            <Plus className="h-4 w-4" /> Add offer
          </ActionButton>
        }
      />

      {showCreate ? (
        <OfferForm
          initial={emptyForm}
          requireImage
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
              <Th>Offer</Th>
              <Th>Link</Th>
              <Th align="right">Sort</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : offers.length === 0 ? (
              <TableEmptyState icon={Tag} message="No offers yet — add one to show it on the home page." colSpan={5} />
            ) : (
              offers.map((o) =>
                editingId === o.id ? (
                  <tr key={o.id}>
                    <td colSpan={5} className="border-b border-border p-4">
                      <OfferForm
                        initial={{
                          title: o.title,
                          subtitle: o.subtitle ?? "",
                          ctaLabel: o.ctaLabel,
                          ctaLink: o.ctaLink ?? "",
                          sortOrder: String(o.sortOrder),
                        }}
                        requireImage={false}
                        saving={saving}
                        error={error}
                        onSave={(values, image) => handleUpdate(o.id, values, image)}
                        onCancel={() => {
                          setEditingId(null);
                          setError("");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={o.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        {o.imageUrl ? (
                          <img src={apiFileUrl(o.imageUrl)} alt={o.title} className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold whitespace-nowrap">{o.title}</p>
                          {o.subtitle ? <p className="truncate text-xs text-muted-foreground">{o.subtitle}</p> : null}
                        </div>
                      </div>
                    </Td>
                    <Td className="max-w-[220px] truncate text-muted-foreground">
                      {o.ctaLink || "—"} <span className="text-foreground/70">· {o.ctaLabel}</span>
                    </Td>
                    <Td align="right">{o.sortOrder}</Td>
                    <Td>
                      <button
                        onClick={() => toggleStatus(o)}
                        disabled={savingStatusId === o.id}
                        className="disabled:opacity-60"
                      >
                        <StatusBadge tone={o.status === "ACTIVE" ? "success" : "danger"}>{o.status}</StatusBadge>
                      </button>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(o.id);
                            setShowCreate(false);
                            setError("");
                          }}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
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
