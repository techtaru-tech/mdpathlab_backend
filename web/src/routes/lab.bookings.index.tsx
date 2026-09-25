import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { LabApiError, labOrdersApi, labPhlebotomistsApi, type LabOrder, type LabPhlebotomist } from "@/lib/lab-api";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { assignmentAttention } from "@/lib/assignmentAttention";

export const Route = createFileRoute("/lab/bookings/")({
  head: () => ({ meta: [{ title: "Bookings — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabBookingsPage,
});

const PAGE_SIZE = 15;
const STATUS_OPTIONS = ["CONFIRMED", "PHLEBOTOMIST_ASSIGNED", "SAMPLE_COLLECTED", "IN_LAB", "CANCELLED"] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LabBookingsPage() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [phlebotomists, setPhlebotomists] = useState<LabPhlebotomist[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  function load(status?: string) {
    setLoading(true);
    labOrdersApi.list(status).then(setOrders).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    labPhlebotomistsApi.list().then(setPhlebotomists);
  }, []);

  async function handleStatusChange(order: LabOrder, status: string) {
    setSavingId(order.id);
    setRowError(null);
    try {
      const updated = await labOrdersApi.updateStatus(order.id, { status });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (err) {
      setRowError({ id: order.id, message: err instanceof LabApiError ? err.message : "Couldn't update status" });
    } finally {
      setSavingId(null);
    }
  }

  async function handlePhlebotomistChange(order: LabOrder, phlebotomistId: string) {
    setSavingId(order.id);
    setRowError(null);
    const dto = {
      status: order.status === "CONFIRMED" ? "PHLEBOTOMIST_ASSIGNED" : order.status,
      ...(phlebotomistId ? { phlebotomistId } : {}),
    };
    try {
      let updated: LabOrder;
      try {
        updated = await labOrdersApi.updateStatus(order.id, dto);
      } catch (err) {
        // 409 = no conflict, but travel time couldn't be verified. Never auto-approved — only with
        // an explicit confirmation, which the backend records on the booking's status log.
        if (!(err instanceof LabApiError) || err.status !== 409) throw err;
        if (!window.confirm(`${err.message}\n\nAssign anyway after checking the route yourself?`)) return;
        updated = await labOrdersApi.updateStatus(order.id, { ...dto, confirmUnverifiedTravel: true });
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (err) {
      setRowError({ id: order.id, message: err instanceof LabApiError ? err.message : "Couldn't assign phlebotomist" });
    } finally {
      setSavingId(null);
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(orders, PAGE_SIZE, statusFilter);

  return (
    <LabLayout activePath="/lab/bookings">
      <AdminPageHeader
        title="Bookings"
        description={`${orders.length} booking${orders.length === 1 ? "" : "s"} assigned to your lab`}
        actions={
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              load(e.target.value || undefined);
            }}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold shadow-sm focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PHLEBOTOMIST_ASSIGNED">Phlebotomist assigned</option>
            <option value="SAMPLE_COLLECTED">Sample collected</option>
            <option value="IN_LAB">In lab</option>
            <option value="REPORT_READY">Report ready</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        }
      />

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Booking</Th>
              <Th>Patient</Th>
              <Th>Schedule</Th>
              <Th>Phlebotomist</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={CalendarCheck} message="No bookings yet." colSpan={6} />
            ) : (
              paged.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap font-semibold">
                    <Link to="/lab/bookings/$orderId" params={{ orderId: o.id }} className="text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <p>{o.user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{o.user.phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {formatDate(o.scheduledDate)} · {o.slot?.label ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {o.collectionType === "HOME" ? (
                      <select
                        value={o.phlebotomist?.id ?? ""}
                        onChange={(e) => handlePhlebotomistChange(o, e.target.value)}
                        disabled={savingId === o.id || o.status === "CANCELLED"}
                        className="h-9 rounded-lg border border-border bg-muted px-2 text-xs font-semibold focus:outline-none disabled:opacity-60"
                      >
                        <option value="">Unassigned</option>
                        {phlebotomists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.user.name ?? p.user.phone}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">Center visit</span>
                    )}
                    {(() => {
                      const attention = assignmentAttention(o);
                      return attention ? (
                        <p className={"mt-1 max-w-56 truncate text-[11px] font-bold " + (attention.tone === "danger" ? "text-destructive" : "text-warning")} title={attention.label}>
                          {attention.label}
                        </p>
                      ) : null;
                    })()}
                  </Td>
                  <Td align="right" className="font-semibold">
                    ₹{o.total}
                  </Td>
                  <Td>
                    <select
                      value={o.status}
                      onChange={(e) => handleStatusChange(o, e.target.value)}
                      disabled={savingId === o.id || o.status === "CANCELLED" || o.status === "REPORT_READY"}
                      className="h-9 rounded-lg border border-border bg-muted px-2 text-xs font-semibold focus:outline-none disabled:opacity-60"
                    >
                      {o.status === "PENDING_PAYMENT" || o.status === "REPORT_READY" ? (
                        <option value={o.status}>{ORDER_STATUS_META[o.status].label}</option>
                      ) : null}
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {ORDER_STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                    {rowError?.id === o.id ? <p className="mt-1 text-[11px] font-semibold text-destructive">{rowError.message}</p> : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </LabLayout>
  );
}
