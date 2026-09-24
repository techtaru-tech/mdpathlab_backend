import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, FlaskConical, IndianRupee, Truck } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { labCatalogueApi, labOrdersApi, labPhlebotomistsApi, type LabOrder } from "@/lib/lab-api";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lab/")({
  head: () => ({ meta: [{ title: "Overview — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabOverviewPage,
});

const statusTone: Record<string, "warning" | "success" | "primary" | "secondary" | "danger"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  PHLEBOTOMIST_ASSIGNED: "primary",
  SAMPLE_COLLECTED: "secondary",
  IN_LAB: "secondary",
  REPORT_READY: "success",
  CANCELLED: "danger",
};

function StatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="min-w-0 flex-1">
        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string | number;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tint)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xl leading-tight font-extrabold tabular-nums">{value}</p>
        <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function BreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-extrabold tabular-nums">{count}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function LabOverviewPage() {
  const [orders, setOrders] = useState<LabOrder[] | null>(null);
  const [phlebotomistCount, setPhlebotomistCount] = useState<number | null>(null);
  const [catalogueCount, setCatalogueCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    labOrdersApi.list().then(setOrders).catch(() => setError("Couldn't load dashboard — check you're signed in"));
    labPhlebotomistsApi.list().then((rows) => setPhlebotomistCount(rows.length)).catch(() => {});
    labCatalogueApi.get().then((res) => setCatalogueCount(res.selected.length)).catch(() => {});
  }, []);

  const summary = useMemo(() => {
    if (!orders) return null;
    const today = new Date().toDateString();
    const todaysBookings = orders.filter((o) => o.scheduledDate && new Date(o.scheduledDate).toDateString() === today).length;
    const pendingAssignment = orders.filter((o) => o.collectionType === "HOME" && !o.phlebotomist && o.status !== "CANCELLED").length;
    const revenueCollected = orders
      .filter((o) => o.status !== "CANCELLED" && o.status !== "PENDING_PAYMENT")
      .reduce((sum, o) => sum + o.total, 0);
    const ordersByStatus: Record<string, number> = {};
    for (const o of orders) ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
    const recentOrders = [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6);
    return { todaysBookings, pendingAssignment, revenueCollected, ordersByStatus, recentOrders };
  }, [orders]);

  const totalOrdersByStatus = summary ? Object.values(summary.ordersByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <LabLayout activePath="/lab">
      <AdminPageHeader title="Overview" description="A snapshot of your lab's bookings." />

      {error ? <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p> : null}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {summary ? (
          <>
            <StatCard icon={CalendarCheck} label="Today's bookings" value={summary.todaysBookings} tint="bg-primary-soft text-primary" />
            <StatCard icon={Truck} label="Pending assignment" value={summary.pendingAssignment} tint="bg-warning/15 text-warning" />
            <StatCard icon={IndianRupee} label="Revenue (all-time)" value={`₹${summary.revenueCollected}`} tint="bg-success-soft text-success" />
            <StatCard
              icon={FlaskConical}
              label="Tests & packages offered"
              value={catalogueCount ?? "—"}
              tint="bg-muted text-foreground"
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Recent bookings</h2>
            <Link to="/lab/bookings" className="text-xs font-bold text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            {summary ? (
              summary.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      <th className="pb-2.5 font-bold">Booking</th>
                      <th className="pb-2.5 font-bold">Patient</th>
                      <th className="pb-2.5 text-right font-bold">Amount</th>
                      <th className="pb-2.5 text-right font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentOrders.map((o) => (
                      <tr key={o.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5">
                          <Link to="/lab/bookings/$orderId" params={{ orderId: o.id }} className="font-bold hover:underline">
                            {o.orderNumber}
                          </Link>
                          <p className="text-[11px] text-muted-foreground">{formatDate(o.createdAt)}</p>
                        </td>
                        <td className="py-2.5">
                          <p className="font-semibold">{o.user.name || o.user.phone}</p>
                        </td>
                        <td className="py-2.5 text-right font-bold tabular-nums">₹{o.total}</td>
                        <td className="py-2.5 text-right">
                          <StatusBadge tone={statusTone[o.status] ?? "secondary"}>{ORDER_STATUS_META[o.status]?.label ?? o.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Bookings by status</h2>
          {summary ? (
            <div className="mt-4 space-y-3">
              {Object.entries(summary.ordersByStatus).length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                Object.entries(summary.ordersByStatus).map(([status, count]) => (
                  <BreakdownRow key={status} label={ORDER_STATUS_META[status as LabOrder["status"]]?.label ?? status} count={count} total={totalOrdersByStatus} />
                ))
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-2 w-full animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Your team</h2>
          <Link to="/lab/phlebotomists" className="text-xs font-bold text-primary hover:underline">
            Manage →
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {phlebotomistCount === null ? "Loading…" : `${phlebotomistCount} phlebotomist${phlebotomistCount === 1 ? "" : "s"} on your roster.`}
        </p>
      </div>
    </LabLayout>
  );
}
