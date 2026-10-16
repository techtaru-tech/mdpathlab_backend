import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bike, FileSpreadsheet, Pencil, Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { Avatar, TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminLabsApi, adminPhlebotomistsApi, type AdminPhlebotomist } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/phlebotomists")({
  head: () => ({ meta: [{ title: "Phlebotomists — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPhlebotomistsPage,
});

type SortKey = "name" | "employeeCode" | "coverageCity" | "status";

const PAGE_SIZE = 10;

const STATUS_OPTIONS: AdminPhlebotomist["status"][] = ["ACTIVE", "ON_LEAVE", "INACTIVE"];

const emptyForm = { phone: "", name: "", coverageCity: "", vehicleType: "", vehicleNumber: "", labId: "" };
const inputCls = "h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";

const statusTone: Record<AdminPhlebotomist["status"], "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "danger",
};

function AdminPhlebotomistsPage() {
  const [list, setList] = useState<AdminPhlebotomist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  useEffect(() => {
    adminLabsApi
      .list()
      .then((rows) => setLabs(rows.map((l) => ({ id: l.id, name: l.name }))))
      .catch(() => setLabs([]));
  }, []);

  useEffect(() => {
    adminPhlebotomistsApi
      .list()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(p: AdminPhlebotomist) {
    setEditingId(p.id);
    setForm({
      phone: p.user.phone,
      name: p.user.name ?? "",
      coverageCity: p.coverageCity ?? "",
      vehicleType: p.vehicleType ?? "",
      vehicleNumber: p.vehicleNumber ?? "",
      labId: p.labId ?? "",
    });
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSave() {
    setError("");
    if (form.name.trim().length < 2) return setError("Enter the full name");
    if (!/^[6-9]\d{9}$/.test(form.phone)) return setError("Enter a valid 10-digit mobile number");
    setSaving(true);
    try {
      if (editingId) {
        const updated = await adminPhlebotomistsApi.update(editingId, {
          name: form.name.trim(),
          phone: form.phone,
          coverageCity: form.coverageCity.trim(),
          vehicleType: form.vehicleType.trim(),
          vehicleNumber: form.vehicleNumber.trim(),
          labId: form.labId || null,
        });
        setList((prev) => prev.map((x) => (x.id === editingId ? { ...x, ...updated, completedCollections: x.completedCollections } : x)));
      } else {
        const created = await adminPhlebotomistsApi.create({
          phone: form.phone,
          name: form.name.trim(),
          ...(form.coverageCity.trim() ? { coverageCity: form.coverageCity.trim() } : {}),
          ...(form.vehicleType.trim() ? { vehicleType: form.vehicleType.trim() } : {}),
          ...(form.vehicleNumber.trim() ? { vehicleNumber: form.vehicleNumber.trim() } : {}),
          ...(form.labId ? { labId: form.labId } : {}),
        });
        setList((prev) => [...prev, { ...created, completedCollections: 0 }]);
      }
      closeForm();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : editingId ? "Couldn't update this phlebotomist" : "Couldn't create phlebotomist");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await adminPhlebotomistsApi.exportExcel();
    } catch (err) {
      setExportError(err instanceof AdminApiError ? err.message : "Couldn't download the Excel file — please try again");
    } finally {
      setExporting(false);
    }
  }

  // A phlebotomist only appears in a lab's dashboard (and can only be assigned that lab's bookings) once linked to it.
  async function handleLabChange(p: AdminPhlebotomist, labId: string) {
    setSavingId(p.id);
    try {
      const updated = await adminPhlebotomistsApi.setLab(p.id, labId || null);
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, labId: updated.labId, lab: updated.lab } : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusChange(p: AdminPhlebotomist, status: AdminPhlebotomist["status"]) {
    setSavingId(p.id);
    try {
      const updated = await adminPhlebotomistsApi.updateStatus(p.id, status);
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...updated, completedCollections: x.completedCollections } : x)));
    } finally {
      setSavingId(null);
    }
  }

  function handleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key: key as SortKey, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: key as SortKey, dir: "asc" }));
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return (a.user.name ?? a.user.phone).localeCompare(b.user.name ?? b.user.phone) * dir;
        case "employeeCode":
          return a.employeeCode.localeCompare(b.employeeCode) * dir;
        case "coverageCity":
          return (a.coverageCity ?? "").localeCompare(b.coverageCity ?? "") * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
      }
    });
  }, [list, sort]);

  const { page, setPage, pageCount, paged, total } = usePagedList(sorted, PAGE_SIZE, sort.key + sort.dir);

  return (
    <AdminLayout activePath="/admin/phlebotomists">
      <AdminPageHeader
        title="Phlebotomists"
        description={`${list.length} on the team`}
        actions={
          <>
            <ActionButton type="button" onClick={handleExport} variant="outline" size="sm" disabled={exporting || list.length === 0}>
              <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Preparing…" : "Export to Excel"}
            </ActionButton>
            <ActionButton type="button" onClick={() => (showForm ? closeForm() : openAdd())} variant={showForm ? "outline" : "primary"} size="sm">
              <Plus className="h-4 w-4" /> Add phlebotomist
            </ActionButton>
          </>
        }
      />
      {exportError ? <p className="mt-3 text-sm font-semibold text-destructive">{exportError}</p> : null}

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <p className="text-sm font-extrabold sm:col-span-2">{editingId ? "Edit phlebotomist" : "Add phlebotomist"}</p>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" aria-label="Full name" className={inputCls} />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            inputMode="numeric"
            maxLength={10}
            placeholder="Mobile number (their login)"
            aria-label="Mobile number"
            className={inputCls}
          />
          <input value={form.coverageCity} onChange={(e) => setForm((f) => ({ ...f, coverageCity: e.target.value }))} placeholder="Coverage city" aria-label="Coverage city" className={inputCls} />
          <select value={form.labId} onChange={(e) => setForm((f) => ({ ...f, labId: e.target.value }))} aria-label="Lab" className={inputCls}>
            <option value="">Lab — not linked (no lab will see them)</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} placeholder="Vehicle type (e.g. Bike)" aria-label="Vehicle type" className={inputCls} />
          <input
            value={form.vehicleNumber}
            onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
            placeholder="Vehicle number"
            aria-label="Vehicle number"
            className={inputCls}
          />
          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <ActionButton type="button" onClick={handleSave} variant="primary" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Save"}
            </ActionButton>
            <ActionButton type="button" onClick={closeForm} variant="outline" size="sm">
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="name" activeSort={sort} onSort={handleSort}>Phlebotomist</Th>
              <Th sortKey="employeeCode" activeSort={sort} onSort={handleSort}>Employee code</Th>
              <Th sortKey="coverageCity" activeSort={sort} onSort={handleSort}>Coverage</Th>
              <Th>Lab</Th>
              <Th sortKey="status" activeSort={sort} onSort={handleSort}>Status</Th>
              <Th align="right">Completed collections</Th>
              <Th>Update status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={8} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Bike} message="No phlebotomists yet." colSpan={8} />
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar label={p.user.name ?? p.user.phone} />
                      <div className="min-w-0">
                        <p className="font-semibold whitespace-nowrap">{p.user.name ?? "No name on file"}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.user.phone}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{p.employeeCode}</Td>
                  <Td>{p.coverageCity ?? "—"}</Td>
                  <Td>
                    <select
                      value={p.labId ?? ""}
                      disabled={savingId === p.id}
                      onChange={(e) => handleLabChange(p, e.target.value)}
                      aria-label={`Lab for ${p.user.name ?? p.user.phone}`}
                      className={
                        "h-9 max-w-[200px] rounded-lg border px-2.5 text-xs font-semibold focus:outline-none " +
                        (p.labId ? "border-border bg-muted" : "border-warning/50 bg-warning/10 text-foreground")
                      }
                    >
                      <option value="">Not linked</option>
                      {labs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <StatusBadge tone={statusTone[p.status]}>{p.status.replace("_", " ")}</StatusBadge>
                  </Td>
                  <Td align="right">{p.completedCollections}</Td>
                  <Td>
                    <select
                      value={p.status}
                      disabled={savingId === p.id}
                      onChange={(e) => handleStatusChange(p, e.target.value as AdminPhlebotomist["status"])}
                      className="h-9 rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      aria-label={`Edit ${p.user.name ?? p.user.phone}`}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
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
