import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminCouponsApi, type AdminCoupon, type CouponInput } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({ meta: [{ title: "Coupons — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCouponsPage,
});

const PAGE_SIZE = 10;

type FormState = {
  code: string;
  type: "PERCENT" | "FLAT";
  value: string;
  minOrderValue: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  status: "ACTIVE" | "INACTIVE";
};

const emptyForm: FormState = {
  code: "",
  type: "PERCENT",
  value: "",
  minOrderValue: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  status: "ACTIVE",
};

function toInput(form: FormState): CouponInput | null {
  const value = Number(form.value);
  if (!form.code.trim() || !Number.isInteger(value) || value <= 0) return null;
  if (form.type === "PERCENT" && value > 100) return null;
  if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) return null;

  return {
    code: form.code.trim().toUpperCase(),
    type: form.type,
    value,
    minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : null,
    maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
    usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
    status: form.status,
  };
}

function formToDateLocal(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CouponForm({
  initial,
  lockCode,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: FormState;
  lockCode: boolean;
  saving: boolean;
  error: string;
  onSave: (form: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const input = toInput(form);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <input
        value={form.code}
        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
        disabled={lockCode}
        placeholder="Coupon code (e.g. WELCOME10)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold uppercase focus:outline-none disabled:opacity-60 sm:col-span-2"
      />
      <select
        value={form.type}
        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "PERCENT" | "FLAT" }))}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      >
        <option value="PERCENT">Percent off</option>
        <option value="FLAT">Flat amount off</option>
      </select>
      <input
        type="number"
        min={1}
        value={form.value}
        onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
        placeholder={form.type === "PERCENT" ? "Value (e.g. 10 for 10%)" : "Value in ₹"}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        type="number"
        min={0}
        value={form.minOrderValue}
        onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
        placeholder="Minimum order value (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        type="number"
        min={0}
        value={form.maxDiscount}
        onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
        placeholder="Max discount cap in ₹ (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        type="number"
        min={1}
        value={form.usageLimit}
        onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
        placeholder="Total usage limit (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <select
        value={form.status}
        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
      >
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Starts on (optional)</span>
        <input
          type="date"
          value={form.startsAt}
          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Ends on (optional)</span>
        <input
          type="date"
          value={form.endsAt}
          onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
      </label>
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton type="button" onClick={() => onSave(form)} variant="primary" size="sm" disabled={saving || !input}>
          {saving ? "Saving…" : "Save coupon"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");

  function load() {
    setLoading(true);
    adminCouponsApi
      .list()
      .then(setCoupons)
      .catch((err) => setListError(err instanceof AdminApiError ? err.message : "Couldn't load coupons"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(form: FormState) {
    const input = toInput(form);
    if (!input) return;
    setSaving(true);
    setError("");
    try {
      await adminCouponsApi.create(input);
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create coupon");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, form: FormState) {
    const input = toInput(form);
    if (!input) return;
    setSaving(true);
    setError("");
    try {
      const { code: _code, ...rest } = input;
      await adminCouponsApi.update(id, rest);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update coupon");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(c: AdminCoupon) {
    setSaving(true);
    try {
      await adminCouponsApi.update(c.id, { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this coupon? This can't be undone.")) return;
    try {
      await adminCouponsApi.remove(id);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't delete coupon");
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(coupons, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/coupons">
      <AdminPageHeader
        title="Coupons"
        description={`${coupons.length} coupon${coupons.length === 1 ? "" : "s"} · discounts patients can apply at checkout`}
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
            <Plus className="h-4 w-4" /> Add coupon
          </ActionButton>
        }
      />

      {listError ? <p className="mt-3 text-sm font-semibold text-destructive">{listError}</p> : null}

      {showCreate ? (
        <CouponForm
          initial={emptyForm}
          lockCode={false}
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
              <Th>Code</Th>
              <Th>Discount</Th>
              <Th>Min order</Th>
              <Th>Validity</Th>
              <Th align="right">Used</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Tag} message="No coupons yet — add one to offer discounts at checkout." colSpan={7} />
            ) : (
              paged.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={7} className="border-b border-border p-4">
                      <CouponForm
                        initial={{
                          code: c.code,
                          type: c.type,
                          value: String(c.value),
                          minOrderValue: c.minOrderValue !== null ? String(c.minOrderValue) : "",
                          maxDiscount: c.maxDiscount !== null ? String(c.maxDiscount) : "",
                          startsAt: formToDateLocal(c.startsAt),
                          endsAt: formToDateLocal(c.endsAt),
                          usageLimit: c.usageLimit !== null ? String(c.usageLimit) : "",
                          status: c.status,
                        }}
                        lockCode
                        saving={saving}
                        error={error}
                        onSave={(form) => handleUpdate(c.id, form)}
                        onCancel={() => {
                          setEditingId(null);
                          setError("");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <Td className="font-semibold whitespace-nowrap">{c.code}</Td>
                    <Td className="whitespace-nowrap">
                      {c.type === "PERCENT" ? `${c.value}% off` : `₹${c.value} off`}
                      {c.maxDiscount !== null ? <span className="text-muted-foreground"> (cap ₹{c.maxDiscount})</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{c.minOrderValue !== null ? `₹${c.minOrderValue}` : "—"}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {c.startsAt || c.endsAt ? `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}` : "No limit"}
                    </Td>
                    <Td align="right">
                      {c.usedCount}
                      {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""}
                    </Td>
                    <Td>
                      <button onClick={() => handleToggleStatus(c)} disabled={saving} className="disabled:opacity-60">
                        <StatusBadge tone={c.status === "ACTIVE" ? "success" : "danger"}>{c.status === "ACTIVE" ? "Active" : "Inactive"}</StatusBadge>
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

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
