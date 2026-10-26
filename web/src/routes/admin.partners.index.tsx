import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Settings2, Stethoscope } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminPartnersApi, type AdminPartnerRow } from "@/lib/admin-partners-api";
import { PARTNER_STATUS_LABELS, PARTNER_STATUS_TONES, type PartnerStatus, type PartnerType } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/partners/")({
  head: () => ({ meta: [{ title: "Doctors & Clinics — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPartnersPage,
});

const PAGE_SIZE = 20;

type Tab = { key: string; label: string; type?: PartnerType; status?: PartnerStatus };
const TABS: Tab[] = [
  { key: "pending", label: "Applications to review", status: "PENDING" },
  { key: "doctors", label: "Doctors", type: "DOCTOR" },
  { key: "clinics", label: "Clinics", type: "CLINIC" },
  { key: "all", label: "All" },
];

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function AdminPartnersPage() {
  const [tab, setTab] = useState<Tab>(TABS[0]!);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminPartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminPartnersApi
      .summary()
      .then((s) => setPendingCount(s.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.count, 0)))
      .catch(() => {});
  }, []);

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError("");
    adminPartnersApi
      .list({ type: tab.type, status: tab.status, q: query || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load partners"))
      .finally(() => setLoading(false));
  }, [tab, query, page]);

  return (
    <AdminLayout activePath="/admin/partners">
      <AdminPageHeader
        title="Doctors & Clinics"
        description={`${pendingCount} application${pendingCount === 1 ? "" : "s"} waiting for review`}
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone, reg. no. or city"
                className="w-48 bg-transparent text-sm focus:outline-none sm:w-64"
              />
            </div>
            <Link to="/admin/partner-settings" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold shadow-sm hover:bg-muted">
              <Settings2 className="h-4 w-4" /> Settings
            </Link>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold",
              tab.key === t.key ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground/75 hover:bg-muted",
            )}
          >
            {t.label}
            {t.key === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-4">
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Registration / establishment</Th>
              <Th>City</Th>
              <Th>Mobile</Th>
              <Th>Submitted</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : rows.length === 0 ? (
              <TableEmptyState icon={Stethoscope} message="Nothing here yet." colSpan={7} />
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="font-semibold whitespace-nowrap">
                    <Link to="/admin/partners/$partnerId" params={{ partnerId: p.id }} className="text-primary hover:underline">
                      {p.displayName || "(details not saved)"}
                    </Link>
                  </Td>
                  <Td>{p.type === "DOCTOR" ? "Doctor" : "Clinic"}</Td>
                  <Td className="text-muted-foreground">
                    {p.doctorProfile ? `${p.doctorProfile.medicalCouncil} · ${p.doctorProfile.registrationNumber}` : (p.clinicProfile?.clinicType.label ?? "—")}
                  </Td>
                  <Td>{p.doctorProfile?.city ?? p.clinicProfile?.city ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{p.phone}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(p.submittedAt)}</Td>
                  <Td>
                    <StatusBadge tone={PARTNER_STATUS_TONES[p.status]}>{PARTNER_STATUS_LABELS[p.status]}</StatusBadge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? (
        <AdminPagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      ) : null}
    </AdminLayout>
  );
}
