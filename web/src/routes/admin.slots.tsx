import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminCollectionCentersApi,
  adminSlotAvailabilityApi,
  adminSlotsApi,
  type AdminCollectionCenter,
  type AdminSlot,
  type AdminSlotAvailability,
  type SlotAvailabilityInput,
  type SlotInput,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/slots")({
  head: () => ({ meta: [{ title: "Slot Availability — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminSlotAvailabilityPage,
});

type Scope = "GLOBAL" | "HOME" | "CENTER_ALL" | "CENTER_SPECIFIC";

type FormState = {
  slotId: string;
  date: string;
  scope: Scope;
  collectionCenterId: string;
  capacity: string;
};

const emptyForm: FormState = { slotId: "", date: "", scope: "GLOBAL", collectionCenterId: "", capacity: "" };

const PAGE_SIZE = 10;

function toInput(form: FormState): SlotAvailabilityInput | null {
  const capacity = Number(form.capacity);
  if (!form.slotId || !form.date || !Number.isInteger(capacity) || capacity < 0) return null;
  if (form.scope === "CENTER_SPECIFIC" && !form.collectionCenterId) return null;
  return {
    slotId: form.slotId,
    date: form.date,
    capacity,
    ...(form.scope === "HOME" ? { collectionType: "HOME" as const } : {}),
    ...(form.scope === "CENTER_ALL" ? { collectionType: "CENTER" as const } : {}),
    ...(form.scope === "CENTER_SPECIFIC" ? { collectionType: "CENTER" as const, collectionCenterId: form.collectionCenterId } : {}),
  };
}

type SlotFormState = { label: string; startTime: string; endTime: string; sortOrder: string; isActive: boolean };

const emptySlotForm: SlotFormState = { label: "", startTime: "", endTime: "", sortOrder: "0", isActive: true };

function slotFormToInput(form: SlotFormState): SlotInput | null {
  if (!form.label.trim() || !form.startTime || !form.endTime) return null;
  if (form.startTime >= form.endTime) return null;
  return {
    label: form.label.trim(),
    startTime: form.startTime,
    endTime: form.endTime,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
  };
}

function SlotForm({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: SlotFormState;
  saving: boolean;
  error: string;
  onSave: (form: SlotFormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const input = slotFormToInput(form);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <input
        value={form.label}
        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        placeholder="Label (e.g. 07:00 AM - 08:00 AM)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
      />
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Start time</span>
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">End time</span>
        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
      </label>
      <input
        type="number"
        step={1}
        value={form.sortOrder}
        onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
        placeholder="Sort order (lower shows first)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
      />
      <label className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-muted px-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="h-4 w-4 accent-primary"
        />
        Active
      </label>
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton type="button" onClick={() => onSave(form)} variant="primary" size="sm" disabled={saving || !input}>
          {saving ? "Saving…" : "Save slot"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function ConfigForm({
  slots,
  centres,
  initial,
  saving,
  error,
  onSave,
  onCancel,
  lockScope,
}: {
  slots: AdminSlot[];
  centres: AdminCollectionCenter[];
  initial: FormState;
  saving: boolean;
  error: string;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  lockScope: boolean; // true when editing — scope/slot/date form the row's identity, only capacity changes
}) {
  const [form, setForm] = useState(initial);
  const input = toInput(form);

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <select
        value={form.slotId}
        onChange={(e) => setForm((f) => ({ ...f, slotId: e.target.value }))}
        disabled={lockScope}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60"
      >
        <option value="">Select a slot…</option>
        {slots.map((s) => (
          <option key={s.id} value={s.id} disabled={!s.isActive}>
            {s.label} {s.isActive ? "" : "(inactive)"}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        disabled={lockScope}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60"
      />
      <select
        value={form.scope}
        onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as Scope, collectionCenterId: "" }))}
        disabled={lockScope}
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60"
      >
        <option value="GLOBAL">Global — applies to Home and Centre alike</option>
        <option value="HOME">Home only</option>
        <option value="CENTER_ALL">Centre — all centres</option>
        <option value="CENTER_SPECIFIC">Centre — one specific centre</option>
      </select>
      {form.scope === "CENTER_SPECIFIC" ? (
        <select
          value={form.collectionCenterId}
          onChange={(e) => setForm((f) => ({ ...f, collectionCenterId: e.target.value }))}
          disabled={lockScope}
          className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60"
        >
          <option value="">Select a centre…</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <div />
      )}
      <input
        type="number"
        min={0}
        step={1}
        value={form.capacity}
        onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
        placeholder="Capacity (0 blocks the slot entirely)"
        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
      />
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton type="button" onClick={() => onSave(form)} variant="primary" size="sm" disabled={saving || !input}>
          {saving ? "Saving…" : "Save"}
        </ActionButton>
        <ActionButton type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function AdminSlotAvailabilityPage() {
  const [rows, setRows] = useState<AdminSlotAvailability[]>([]);
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [centres, setCentres] = useState<AdminCollectionCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState<"" | "HOME" | "CENTER">("");
  const [filterCentre, setFilterCentre] = useState("");
  const [filterSlot, setFilterSlot] = useState("");

  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotError, setSlotError] = useState("");

  function loadSlots() {
    adminSlotsApi.list().then(setSlots);
  }

  async function handleCreateSlot(form: SlotFormState) {
    const input = slotFormToInput(form);
    if (!input) return;
    setSavingSlot(true);
    setSlotError("");
    try {
      await adminSlotsApi.create(input);
      setShowCreateSlot(false);
      loadSlots();
    } catch (err) {
      setSlotError(err instanceof AdminApiError ? err.message : "Couldn't create slot");
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleUpdateSlot(id: string, form: SlotFormState) {
    const input = slotFormToInput(form);
    if (!input) return;
    setSavingSlot(true);
    setSlotError("");
    try {
      await adminSlotsApi.update(id, input);
      setEditingSlotId(null);
      loadSlots();
    } catch (err) {
      setSlotError(err instanceof AdminApiError ? err.message : "Couldn't update slot");
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleToggleSlotActive(slot: AdminSlot) {
    setSavingSlot(true);
    try {
      await adminSlotsApi.update(slot.id, { isActive: !slot.isActive });
      loadSlots();
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleDeleteSlot(id: string) {
    if (!window.confirm("Delete this time slot? This can't be undone.")) return;
    try {
      await adminSlotsApi.remove(id);
      loadSlots();
    } catch (err) {
      setSlotError(err instanceof AdminApiError ? err.message : "Couldn't delete slot");
    }
  }

  function load() {
    setLoading(true);
    adminSlotAvailabilityApi
      .list({
        ...(filterDate ? { date: filterDate } : {}),
        ...(filterType ? { collectionType: filterType } : {}),
        ...(filterCentre ? { collectionCenterId: filterCentre } : {}),
        ...(filterSlot ? { slotId: filterSlot } : {}),
      })
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.all([adminSlotsApi.list(), adminCollectionCentersApi.list()]).then(([slotList, centreList]) => {
      setSlots(slotList);
      setCentres(centreList);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterType, filterCentre, filterSlot]);

  async function handleCreate(form: FormState) {
    const input = toInput(form);
    if (!input) return;
    setSaving(true);
    setError("");
    try {
      await adminSlotAvailabilityApi.create(input);
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, form: FormState) {
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) return;
    setSaving(true);
    setError("");
    try {
      await adminSlotAvailabilityApi.update(id, capacity);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't update configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this configuration? The slot reverts to unlimited (or its next fallback scope) immediately.")) return;
    await adminSlotAvailabilityApi.remove(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const activeSlots = useMemo(() => slots.filter((s) => s.isActive), [slots]);

  const { page, setPage, pageCount, paged, total } = usePagedList(rows, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/slots">
      <AdminPageHeader
        title="Time Slots"
        description={`${slots.length} time slot${slots.length === 1 ? "" : "s"} · these are the collection windows patients can pick at checkout`}
        actions={
          <ActionButton
            type="button"
            onClick={() => {
              setShowCreateSlot((v) => !v);
              setEditingSlotId(null);
              setSlotError("");
            }}
            variant={showCreateSlot ? "outline" : "primary"}
            size="sm"
          >
            <Plus className="h-4 w-4" /> Add time slot
          </ActionButton>
        }
      />

      {showCreateSlot ? (
        <SlotForm
          initial={emptySlotForm}
          saving={savingSlot}
          error={slotError}
          onSave={handleCreateSlot}
          onCancel={() => {
            setShowCreateSlot(false);
            setSlotError("");
          }}
        />
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Label</Th>
              <Th>Start</Th>
              <Th>End</Th>
              <Th align="right">Sort</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <TableEmptyState icon={Clock} message="No time slots yet — add one to let patients book against it." colSpan={6} />
            ) : (
              slots.map((s) =>
                editingSlotId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={6} className="border-b border-border p-4">
                      <SlotForm
                        initial={{
                          label: s.label,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          sortOrder: String(s.sortOrder),
                          isActive: s.isActive,
                        }}
                        saving={savingSlot}
                        error={slotError}
                        onSave={(form) => handleUpdateSlot(s.id, form)}
                        onCancel={() => {
                          setEditingSlotId(null);
                          setSlotError("");
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="transition-colors hover:bg-muted/40">
                    <Td className="font-semibold whitespace-nowrap">{s.label}</Td>
                    <Td className="whitespace-nowrap">{s.startTime}</Td>
                    <Td className="whitespace-nowrap">{s.endTime}</Td>
                    <Td align="right">{s.sortOrder}</Td>
                    <Td>
                      <button onClick={() => handleToggleSlotActive(s)} disabled={savingSlot} className="disabled:opacity-60">
                        <StatusBadge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</StatusBadge>
                      </button>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingSlotId(s.id);
                            setShowCreateSlot(false);
                            setSlotError("");
                          }}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSlot(s.id)}
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

      <div className="mt-10 border-t border-border pt-8">
        <AdminPageHeader
          title="Slot Availability"
        description={`${rows.length} configuration${rows.length === 1 ? "" : "s"} · no configuration for a slot/date means unlimited capacity`}
        actions={
          <>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "HOME" | "CENTER")}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
            >
              <option value="">All types</option>
              <option value="HOME">Home</option>
              <option value="CENTER">Centre</option>
            </select>
            <select
              value={filterCentre}
              onChange={(e) => setFilterCentre(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
            >
              <option value="">All centres</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={filterSlot}
              onChange={(e) => setFilterSlot(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
            >
              <option value="">All slots</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
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
              <Plus className="h-4 w-4" /> Add configuration
            </ActionButton>
          </>
        }
      />

      {showCreate ? (
        <ConfigForm slots={activeSlots} centres={centres} initial={emptyForm} saving={saving} error={error} onSave={handleCreate} onCancel={() => setShowCreate(false)} lockScope={false} />
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Slot</Th>
              <Th>Scope</Th>
              <Th align="right">Capacity</Th>
              <Th align="right">Booked</Th>
              <Th align="right">Remaining</Th>
              <Th>Availability</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={8} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Clock} message="No capacity configurations yet — every slot is unlimited by default." colSpan={8} />
            ) : (
              paged.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={8} className="border-b border-border p-4">
                      <ConfigForm
                        slots={activeSlots}
                        centres={centres}
                        initial={{
                          slotId: r.slotId,
                          date: r.date,
                          scope: !r.collectionType ? "GLOBAL" : r.collectionType === "HOME" ? "HOME" : r.collectionCenterId ? "CENTER_SPECIFIC" : "CENTER_ALL",
                          collectionCenterId: r.collectionCenterId ?? "",
                          capacity: String(r.capacity),
                        }}
                        saving={saving}
                        error={error}
                        onSave={(form) => handleUpdate(r.id, form)}
                        onCancel={() => {
                          setEditingId(null);
                          setError("");
                        }}
                        lockScope
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className="transition-colors hover:bg-muted/40">
                    <Td className="whitespace-nowrap">{r.date}</Td>
                    <Td className="whitespace-nowrap">{r.slotLabel}</Td>
                    <Td>
                      <p className="font-semibold">{r.scopeLabel}</p>
                      {r.fallbackNote ? <p className="mt-0.5 text-[11px] text-muted-foreground">{r.fallbackNote}</p> : null}
                    </Td>
                    <Td align="right">{r.capacity === 0 ? <Ban className="ml-auto h-3.5 w-3.5 text-destructive" /> : r.capacity}</Td>
                    <Td align="right">{r.booked}</Td>
                    <Td align="right">{r.remaining}</Td>
                    <Td>
                      <StatusBadge tone={r.capacity === 0 ? "danger" : r.available ? "success" : "warning"}>
                        {r.capacity === 0 ? "Blocked" : r.available ? "Available" : "Fully booked"}
                      </StatusBadge>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setShowCreate(false);
                            setError("");
                          }}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary/40 hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
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
      </div>
    </AdminLayout>
  );
}
