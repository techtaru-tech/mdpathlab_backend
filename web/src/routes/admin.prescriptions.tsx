import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminLabsApi, adminPrescriptionsApi, type AdminLab, type AdminPrescription, type AdminPrescriptionLabStage } from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/admin/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPrescriptionsPage,
});

const PAGE_SIZE = 10;

const stageLabel: Record<NonNullable<AdminPrescriptionLabStage>, string> = {
  UPLOADED: "New",
  UNDER_REVIEW: "Under review",
  ACTION_REQUIRED: "Action required",
  REVIEWED: "Tests recommended",
  READY_FOR_BOOKING: "Ready for booking",
  BOOKING_CONFIRMED: "Booking confirmed",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminPrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<AdminPrescription[]>([]);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminPrescriptionsApi
      .list()
      .then(setPrescriptions)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    adminLabsApi.list().then(setLabs).catch(() => {});
  }, []);

  async function toggleStatus(p: AdminPrescription) {
    setSavingId(p.id);
    try {
      const updated = await adminPrescriptionsApi.updateStatus(p.id, p.status === "PENDING" ? "REVIEWED" : "PENDING");
      setPrescriptions((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  async function reassignLab(p: AdminPrescription, labId: string) {
    if (!labId) return;
    setSavingId(p.id);
    try {
      const updated = await adminPrescriptionsApi.reassignLab(p.id, labId);
      setPrescriptions((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return prescriptions;
    const q = search.trim().toLowerCase();
    return prescriptions.filter((p) => p.user.phone.includes(q) || (p.user.name ?? "").toLowerCase().includes(q));
  }, [prescriptions, search]);

  const pendingCount = prescriptions.filter((p) => p.status === "PENDING").length;
  const { page, setPage, pageCount, paged, total } = usePagedList(filtered, PAGE_SIZE, search);

  return (
    <AdminLayout activePath="/admin/prescriptions">
      <AdminPageHeader
        title="Prescriptions"
        description={`${prescriptions.length} upload${prescriptions.length === 1 ? "" : "s"} · ${pendingCount} pending review`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient"
              className="w-40 bg-transparent text-sm focus:outline-none"
            />
          </div>
        }
      />

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Uploaded</Th>
              <Th>Patient</Th>
              <Th>Routed lab</Th>
              <Th>Order</Th>
              <Th>Note</Th>
              <Th>File</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={FileText} message="No prescriptions uploaded yet." colSpan={7} />
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <p className="font-semibold">{p.user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{p.user.phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {p.lab ? <p className="font-semibold">{p.lab.name}</p> : p.pincode ? (
                      <p className="text-xs text-muted-foreground">No lab covers {p.pincode} yet</p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {labs.length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => reassignLab(p, e.target.value)}
                        disabled={savingId === p.id}
                        className="mt-1 h-8 rounded-lg border border-border bg-muted px-1.5 text-[11px] font-semibold focus:outline-none disabled:opacity-60"
                      >
                        <option value="">{p.lab ? "Reassign…" : "Assign lab…"}</option>
                        {labs.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{p.order ? `#${p.order.id.slice(-6)}` : "—"}</Td>
                  <Td className="max-w-56 truncate text-muted-foreground">{p.note ?? "—"}</Td>
                  <Td>
                    <a href={apiFileUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                      View
                    </a>
                  </Td>
                  <Td>
                    {p.labStage ? (
                      <StatusBadge tone={p.labStage === "ACTION_REQUIRED" ? "danger" : p.labStage === "UPLOADED" ? "warning" : "success"}>
                        {stageLabel[p.labStage]}
                      </StatusBadge>
                    ) : (
                      <button onClick={() => toggleStatus(p)} disabled={savingId === p.id} className="disabled:opacity-60">
                        <StatusBadge tone={p.status === "PENDING" ? "warning" : "success"}>{p.status === "PENDING" ? "Pending" : "Reviewed"}</StatusBadge>
                      </button>
                    )}
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
