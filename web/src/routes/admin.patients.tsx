import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, UserX, Users, Wallet } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { Avatar, TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminPatientsApi, type AdminPatient, type CreatePatientInput } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({ meta: [{ title: "Patients — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPatientsPage,
});

type SortKey = "phone" | "name" | "familyMembers" | "orders" | "createdAt";

const PAGE_SIZE = 10;

const emptyForm = { phone: "", name: "", email: "", gender: "" as "" | "MALE" | "FEMALE" | "OTHER", dob: "", city: "" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AddPatientForm({
  saving,
  error,
  onSave,
  onCancel,
}: {
  saving: boolean;
  error: string;
  onSave: (values: typeof emptyForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(emptyForm);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <input
        value={form.phone}
        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
        placeholder="10-digit mobile number"
        inputMode="numeric"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Full name (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        placeholder="Email (optional)"
        type="email"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <select
        value={form.gender}
        onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as typeof form.gender }))}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
      >
        <option value="">Gender (optional)</option>
        <option value="MALE">Male</option>
        <option value="FEMALE">Female</option>
        <option value="OTHER">Other</option>
      </select>
      <input
        value={form.dob}
        onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
        type="date"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <input
        value={form.city}
        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        placeholder="City (optional)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton
          type="button"
          onClick={() => onSave(form)}
          variant="primary"
          size="sm"
          disabled={saving || !/^[6-9]\d{9}$/.test(form.phone)}
        >
          {saving ? "Saving…" : "Add patient"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminPatientsPage() {
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creditingId, setCreditingId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState("");
  const [crediting, setCrediting] = useState(false);

  function load(q?: string) {
    setLoading(true);
    setError("");
    adminPatientsApi
      .list(q)
      .then(setPatients)
      .catch(() => setError("Couldn't load patients"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(p: AdminPatient) {
    const next = p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const updated = await adminPatientsApi.updateStatus(p.id, next);
    setPatients((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
  }

  async function handleCreate(values: typeof emptyForm) {
    setSaving(true);
    setCreateError("");
    try {
      const dto: CreatePatientInput = {
        phone: values.phone,
        ...(values.name ? { name: values.name } : {}),
        ...(values.email ? { email: values.email } : {}),
        ...(values.gender ? { gender: values.gender } : {}),
        ...(values.dob ? { dob: values.dob } : {}),
        ...(values.city ? { city: values.city } : {}),
      };
      const created = await adminPatientsApi.create(dto);
      setPatients((prev) => [created, ...prev]);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof AdminApiError ? err.message : "Couldn't add patient");
    } finally {
      setSaving(false);
    }
  }

  function startCreditWallet(p: AdminPatient) {
    setCreditingId(p.id);
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
  }

  async function handleCreditWallet(id: string) {
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setCreditError("Enter a valid amount");
      return;
    }
    if (!creditReason.trim()) {
      setCreditError("Enter a reason for this credit");
      return;
    }
    setCrediting(true);
    setCreditError("");
    try {
      const { balance } = await adminPatientsApi.creditWallet(id, amount, creditReason.trim());
      setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, walletBalance: balance } : p)));
      setCreditingId(null);
    } catch (err) {
      setCreditError(err instanceof AdminApiError ? err.message : "Couldn't credit wallet");
    } finally {
      setCrediting(false);
    }
  }

  function handleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key: key as SortKey, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: key as SortKey, dir: "asc" }));
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...patients].sort((a, b) => {
      switch (sort.key) {
        case "phone":
          return a.phone.localeCompare(b.phone) * dir;
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "") * dir;
        case "familyMembers":
          return (a._count.familyMembers - b._count.familyMembers) * dir;
        case "orders":
          return (a._count.orders - b._count.orders) * dir;
        case "createdAt":
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
  }, [patients, sort]);

  const { page, setPage, pageCount, paged, total } = usePagedList(sorted, PAGE_SIZE, sort.key + sort.dir);

  return (
    <AdminLayout activePath="/admin/patients">
      <AdminPageHeader
        title="Patients"
        description={`${patients.length} patient${patients.length === 1 ? "" : "s"} loaded`}
        actions={
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                load(search);
              }}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search phone or name"
                className="w-44 bg-transparent text-sm focus:outline-none sm:w-56"
              />
            </form>
            <ActionButton
              type="button"
              onClick={() => {
                setShowCreate((v) => !v);
                setCreateError("");
              }}
              variant={showCreate ? "outline" : "primary"}
              size="sm"
            >
              <Plus className="h-4 w-4" /> Add patient
            </ActionButton>
          </>
        }
      />

      {showCreate ? (
        <AddPatientForm saving={saving} error={createError} onSave={handleCreate} onCancel={() => setShowCreate(false)} />
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="phone" activeSort={sort} onSort={handleSort}>Patient</Th>
              <Th sortKey="familyMembers" activeSort={sort} onSort={handleSort} align="right">Family</Th>
              <Th sortKey="orders" activeSort={sort} onSort={handleSort} align="right">Orders</Th>
              <Th align="right">Wallet</Th>
              <Th sortKey="createdAt" activeSort={sort} onSort={handleSort}>Joined</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Users} message="No patients found." colSpan={7} />
            ) : (
              paged.map((p) => (
                <Fragment key={p.id}>
                  <tr className="transition-colors hover:bg-muted/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar label={p.name ?? p.phone} />
                        <div className="min-w-0">
                          <p className="font-semibold whitespace-nowrap">{p.phone}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.name ?? "No name on file"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td align="right">{p._count.familyMembers}</Td>
                    <Td align="right">{p._count.orders}</Td>
                    <Td align="right" className="font-semibold whitespace-nowrap">₹{p.walletBalance}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDate(p.createdAt)}</Td>
                    <Td>
                      <StatusBadge tone={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</StatusBadge>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => (creditingId === p.id ? setCreditingId(null) : startCreditWallet(p))}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Credit wallet
                        </button>
                        <button
                          onClick={() => toggleStatus(p)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-destructive/40 hover:text-destructive"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </Td>
                  </tr>
                  {creditingId === p.id ? (
                    <tr>
                      <Td colSpan={7} className="bg-muted/30">
                        <div className="flex flex-wrap items-center gap-2 py-1">
                          <input
                            value={creditAmount}
                            onChange={(e) => setCreditAmount(e.target.value.replace(/\D/g, ""))}
                            placeholder="Amount (₹)"
                            inputMode="numeric"
                            className="h-10 w-32 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
                          />
                          <input
                            value={creditReason}
                            onChange={(e) => setCreditReason(e.target.value)}
                            placeholder="Reason (e.g. refund, referral bonus)"
                            className="h-10 flex-1 min-w-[220px] rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
                          />
                          <ActionButton type="button" onClick={() => handleCreditWallet(p.id)} variant="primary" size="sm" disabled={crediting}>
                            {crediting ? "Crediting…" : "Credit"}
                          </ActionButton>
                          <ActionButton type="button" onClick={() => setCreditingId(null)} variant="outline" size="sm">
                            Cancel
                          </ActionButton>
                          {creditError ? <p className="w-full text-xs font-semibold text-destructive">{creditError}</p> : null}
                        </div>
                      </Td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
