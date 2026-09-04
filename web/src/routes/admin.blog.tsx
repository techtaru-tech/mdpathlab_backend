import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImageOff, Newspaper, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminBlogApi, type AdminBlogPost, type BlogPostInput } from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/admin/blog")({
  head: () => ({ meta: [{ title: "Blog — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminBlogPage,
});

const emptyForm = {
  title: "",
  slug: "",
  category: "",
  excerpt: "",
  content: "",
  readTimeMinutes: "5",
  status: "DRAFT" as "DRAFT" | "PUBLISHED",
};

type FormValues = typeof emptyForm;

const PAGE_SIZE = 10;

function BlogPostForm({
  initial,
  requireImage,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: FormValues;
  requireImage: boolean;
  saving: boolean;
  error: string;
  onSave: (values: FormValues, image: File | null) => void;
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
        placeholder="Post title"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
      />
      <input
        value={form.slug}
        onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        placeholder="Slug (optional — auto-generated from title)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.category}
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        placeholder="Category (e.g. Preventive Care)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <textarea
        value={form.excerpt}
        onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
        placeholder="Short excerpt shown on cards"
        rows={2}
        className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none sm:col-span-2"
      />
      <textarea
        value={form.content}
        onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
        placeholder="Full article content — separate paragraphs with a blank line"
        rows={10}
        className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none sm:col-span-2"
      />
      <input
        type="number"
        min={1}
        value={form.readTimeMinutes}
        onChange={(e) => setForm((f) => ({ ...f, readTimeMinutes: e.target.value }))}
        placeholder="Read time (minutes)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <select
        value={form.status}
        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "DRAFT" | "PUBLISHED" }))}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
      >
        <option value="DRAFT">Draft</option>
        <option value="PUBLISHED">Published</option>
      </select>
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-semibold text-primary hover:bg-primary-soft sm:col-span-2">
        {image ? image.name : preview ? "Replace cover image" : "Upload cover image"}
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
          <img src={preview} alt="Cover preview" className="h-32 w-full rounded-lg object-cover" />
        </div>
      ) : null}
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton
          type="button"
          onClick={() => onSave(form, image)}
          variant="primary"
          size="sm"
          disabled={
            saving ||
            !form.title.trim() ||
            !form.category.trim() ||
            !form.excerpt.trim() ||
            !form.content.trim() ||
            (requireImage && !image)
          }
        >
          {saving ? "Saving…" : "Save post"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminBlogPage() {
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminBlogApi
      .list()
      .then(setPosts)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function toInput(values: FormValues): BlogPostInput {
    return {
      title: values.title,
      ...(values.slug ? { slug: values.slug } : {}),
      category: values.category,
      excerpt: values.excerpt,
      content: values.content,
      readTimeMinutes: Number(values.readTimeMinutes) || 5,
      status: values.status,
    };
  }

  async function handleCreate(values: FormValues, image: File | null) {
    if (!image) return;
    setSaving(true);
    setError("");
    try {
      const created = await adminBlogApi.create({ ...toInput(values), image });
      setPosts((prev) => [created, ...prev]);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create post");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, values: FormValues, image: File | null) {
    setSaving(true);
    setError("");
    try {
      const updated = await adminBlogApi.update(id, { ...toInput(values), ...(image ? { image } : {}) });
      setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update post");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(p: AdminBlogPost) {
    setSavingStatusId(p.id);
    try {
      const updated = await adminBlogApi.update(p.id, {
        title: p.title,
        category: p.category,
        excerpt: p.excerpt,
        content: p.content,
        status: p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      });
      setPosts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } finally {
      setSavingStatusId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    await adminBlogApi.remove(id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(posts, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/blog">
      <AdminPageHeader
        title="Blog"
        description={`${posts.length} post${posts.length === 1 ? "" : "s"}`}
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
            <Plus className="h-4 w-4" /> Add post
          </ActionButton>
        }
      />

      {showCreate ? (
        <BlogPostForm
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
              <Th>Post</Th>
              <Th>Category</Th>
              <Th align="right">Read time</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Newspaper} message="No posts yet — add one to publish it on the blog." colSpan={5} />
            ) : (
              paged.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={5} className="border-b border-border p-4">
                      <BlogPostForm
                        initial={{
                          title: p.title,
                          slug: p.slug,
                          category: p.category,
                          excerpt: p.excerpt,
                          content: p.content,
                          readTimeMinutes: String(p.readTimeMinutes),
                          status: p.status,
                        }}
                        requireImage={false}
                        saving={saving}
                        error={error}
                        onSave={(values, image) => handleUpdate(p.id, values, image)}
                        onCancel={() => {
                          setEditingId(null);
                          setError("");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.coverImageUrl ? (
                          <img src={apiFileUrl(p.coverImageUrl)} alt={p.title} className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold whitespace-nowrap">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">/{p.slug}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{p.category}</Td>
                    <Td align="right">{p.readTimeMinutes} min</Td>
                    <Td>
                      <button
                        onClick={() => toggleStatus(p)}
                        disabled={savingStatusId === p.id}
                        className="disabled:opacity-60"
                      >
                        <StatusBadge tone={p.status === "PUBLISHED" ? "success" : "warning"}>{p.status}</StatusBadge>
                      </button>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(p.id);
                            setShowCreate(false);
                            setError("");
                          }}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
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

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
