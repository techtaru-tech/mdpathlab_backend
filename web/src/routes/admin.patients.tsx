import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminPatientsApi, type AdminPatient } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({ meta: [{ title: "Patients — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPatientsPage,
});

function AdminPatientsPage() {
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load(q?: string) {
    setLoading(true);
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

  return (
    <AdminLayout activePath="/admin/patients">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Patients</h1>
          <p className="mt-1 text-sm text-muted-foreground">{patients.length} loaded</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(search);
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search phone or name"
            className="w-56 bg-transparent text-sm focus:outline-none"
          />
        </form>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Family</th>
              <th className="px-5 py-3">Orders</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-5 py-6 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-muted-foreground" colSpan={6}>
                  No patients found.
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 font-semibold whitespace-nowrap">{p.phone}</td>
                  <td className="px-5 py-3.5">{p.name ?? "—"}</td>
                  <td className="px-5 py-3.5">{p._count.familyMembers}</td>
                  <td className="px-5 py-3.5">{p._count.orders}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold",
                        p.status === "ACTIVE" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleStatus(p)}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
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
