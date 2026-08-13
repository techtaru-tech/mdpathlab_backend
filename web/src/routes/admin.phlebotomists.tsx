import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bike, Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Avatar, TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminPhlebotomistsApi, type AdminPhlebotomist } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/phlebotomists")({
  head: () => ({ meta: [{ title: "Phlebotomists — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPhlebotomistsPage,
});

type SortKey = "name" | "employeeCode" | "coverageCity" | "status";

const STATUS_OPTIONS: AdminPhlebotomist["status"][] = ["ACTIVE", "ON_LEAVE", "INACTIVE"];

const statusTone: Record<AdminPhlebotomist["status"], "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "danger",
};

function AdminPhlebotomistsPage() {
  const [list, setList] = useState<AdminPhlebotomist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", employeeCode: "", coverageCity: "" });
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  useEffect(() => {
    adminPhlebotomistsApi
      .list()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setError("");
    try {
      const created = await adminPhlebotomistsApi.create(form);
      setList((prev) => [...prev, created]);
      setForm({ phone: "", name: "", employeeCode: "", coverageCity: "" });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't create phlebotomist");
    }
  }

  async function handleStatusChange(p: AdminPhlebotomist, status: AdminPhlebotomist["status"]) {
    setSavingId(p.id);
    try {
      const updated = await adminPhlebotomistsApi.updateStatus(p.id, status);
      setList((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
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

  return (
    <AdminLayout activePath="/admin/phlebotomists">
      <AdminPageHeader
        title="Phlebotomists"
        description={`${list.length} on the team`}
        actions={
          <ActionButton type="button" onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Add phlebotomist
          </ActionButton>
        }
      />

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            placeholder="Mobile number"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.employeeCode}
            onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
            placeholder="Employee code (e.g. PHL-003)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.coverageCity}
            onChange={(e) => setForm((f) => ({ ...f, coverageCity: e.target.value }))}
            placeholder="Coverage city"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <ActionButton type="button" onClick={handleCreate} variant="primary" size="sm" className="sm:col-span-2">
            Save
          </ActionButton>
        </div>
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="name" activeSort={sort} onSort={handleSort}>Phlebotomist</Th>
              <Th sortKey="employeeCode" activeSort={sort} onSort={handleSort}>Employee code</Th>
              <Th sortKey="coverageCity" activeSort={sort} onSort={handleSort}>Coverage</Th>
              <Th sortKey="status" activeSort={sort} onSort={handleSort}>Status</Th>
              <Th>Update status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : sorted.length === 0 ? (
              <TableEmptyState icon={Bike} message="No phlebotomists yet." colSpan={5} />
            ) : (
              sorted.map((p) => (
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
                    <StatusBadge tone={statusTone[p.status]}>{p.status.replace("_", " ")}</StatusBadge>
                  </Td>
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
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </AdminLayout>
  );
}
