import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminPhlebotomistsApi, type AdminPhlebotomist } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/phlebotomists")({
  head: () => ({ meta: [{ title: "Phlebotomists — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPhlebotomistsPage,
});

function AdminPhlebotomistsPage() {
  const [list, setList] = useState<AdminPhlebotomist[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", employeeCode: "", coverageCity: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    adminPhlebotomistsApi.list().then(setList);
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

  return (
    <AdminLayout activePath="/admin/phlebotomists">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Phlebotomists</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Add phlebotomist
        </button>
      </div>

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Employee code</th>
              <th className="px-5 py-3">Coverage</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-muted-foreground" colSpan={5}>
                  No phlebotomists yet.
                </td>
              </tr>
            ) : (
              list.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 font-semibold">{p.user.name ?? "—"}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{p.user.phone}</td>
                  <td className="px-5 py-3.5">{p.employeeCode}</td>
                  <td className="px-5 py-3.5">{p.coverageCity ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold",
                        p.status === "ACTIVE" ? "bg-success-soft text-success" : "bg-warning/15 text-warning",
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
