import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Truck } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LabApiError, labPhlebotomistsApi, type LabPhlebotomist } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/phlebotomists")({
  head: () => ({ meta: [{ title: "Phlebotomists — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabPhlebotomistsPage,
});

const emptyForm = { phone: "", name: "", vehicleType: "", vehicleNumber: "" };

function LabPhlebotomistsPage() {
  const [list, setList] = useState<LabPhlebotomist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    labPhlebotomistsApi.list().then(setList).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(p: LabPhlebotomist) {
    setEditingId(p.id);
    setForm({ phone: p.user.phone, name: p.user.name ?? "", vehicleType: p.vehicleType ?? "", vehicleNumber: p.vehicleNumber ?? "" });
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSave() {
    setError("");
    if (!editingId) return handleCreate();
    try {
      const updated = await labPhlebotomistsApi.update(editingId, {
        name: form.name.trim(),
        phone: form.phone,
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
      });
      setList((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
      closeForm();
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't update this phlebotomist");
    }
  }

  async function handleCreate() {
    setError("");
    try {
      const created = await labPhlebotomistsApi.create({
        phone: form.phone,
        name: form.name,
        ...(form.vehicleType ? { vehicleType: form.vehicleType } : {}),
        ...(form.vehicleNumber ? { vehicleNumber: form.vehicleNumber } : {}),
      });
      setList((prev) => [created, ...prev]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't add this phlebotomist");
    }
  }

  async function toggleStatus(p: LabPhlebotomist) {
    setSavingId(p.id);
    try {
      const updated = await labPhlebotomistsApi.update(p.id, { status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: updated.status } : x)));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <LabLayout activePath="/lab/phlebotomists">
      <AdminPageHeader
        title="Phlebotomists"
        description={`${list.length} phlebotomist${list.length === 1 ? "" : "s"} on your team`}
        actions={
          <ActionButton type="button" onClick={() => (showForm ? closeForm() : setShowForm(true))} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add phlebotomist
          </ActionButton>
        }
      />

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <p className="text-sm font-bold sm:col-span-2">{editingId ? "Edit phlebotomist" : "Add phlebotomist"}</p>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            inputMode="numeric"
            maxLength={10}
            placeholder="Phone (10-digit mobile)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
            placeholder="Vehicle type (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.vehicleNumber}
            onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
            placeholder="Vehicle number (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <ActionButton type="button" onClick={handleSave} variant="primary" size="sm">
              Save
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
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Employee code</Th>
              <Th>Vehicle</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : list.length === 0 ? (
              <TableEmptyState icon={Truck} message="No phlebotomists yet." colSpan={6} />
            ) : (
              list.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="font-semibold">{p.user.name ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{p.user.phone}</Td>
                  <Td className="whitespace-nowrap">{p.employeeCode}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{[p.vehicleType, p.vehicleNumber].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td>
                    <button onClick={() => toggleStatus(p)} disabled={savingId === p.id} className="disabled:opacity-60">
                      <StatusBadge tone={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</StatusBadge>
                    </button>
                  </Td>
                  <Td>
                    <button onClick={() => startEdit(p)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </LabLayout>
  );
}
