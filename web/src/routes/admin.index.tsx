import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  FileClock,
  IndianRupee,
  Receipt,
  Truck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminDashboardApi, type DashboardSummary } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: AdminDashboardPage,
});

const statusMeta: Record<string, { label: string; tint: string; tone: "warning" | "success" | "primary" | "secondary" | "danger" }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tint: "bg-warning", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tint: "bg-success", tone: "success" },
  PHLEBOTOMIST_ASSIGNED: { label: "Phlebotomist assigned", tint: "bg-primary", tone: "primary" },
  SAMPLE_COLLECTED: { label: "Sample collected", tint: "bg-secondary", tone: "secondary" },
  IN_LAB: { label: "In lab", tint: "bg-secondary", tone: "secondary" },
  REPORT_READY: { label: "Report ready", tint: "bg-success", tone: "success" },
  CANCELLED: { label: "Cancelled", tint: "bg-destructive", tone: "danger" },
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

function RevenueTrend({ trend }: { trend: DashboardSummary["revenueTrend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.amount));
  return (
    <div className="flex h-40 items-end gap-2.5">
      {trend.map((t) => (
        <div key={t.date} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end">
            <div
              className="w-full rounded-md bg-primary/80 transition-all"
              style={{ height: `${Math.max(4, Math.round((t.amount / max) * 100))}%` }}
              title={`₹${t.amount}`}
            />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground">
            {new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function AdminDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminDashboardApi
      .summary()
      .then(setSummary)
      .catch(() => setError("Couldn't load dashboard — check you're signed in"));
  }, []);

  const totalOrdersByStatus = summary ? Object.values(summary.ordersByStatus).reduce((a, b) => a + b, 0) : 0;
  const totalPaymentMethods = summary ? Object.values(summary.paymentMethodBreakdown).reduce((a, b) => a + b, 0) : 0;
  const totalCollectionTypes = summary ? Object.values(summary.collectionTypeBreakdown).reduce((a, b) => a + b, 0) : 0;

  return (
    <AdminLayout activePath="/admin">
      <AdminPageHeader title="Overview" description="A snapshot of today's operations." />

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p>
      ) : null}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {summary ? (
          <>
            <StatCard icon={CalendarCheck} label="Today's bookings" value={summary.todaysBookings} tint="bg-primary-soft text-primary" />
            <StatCard icon={Truck} label="Pending assignment" value={summary.pendingAssignment} tint="bg-warning/15 text-warning" />
            <StatCard icon={Users} label="Total patients" value={summary.totalPatients} tint="bg-secondary-soft text-secondary" />
            <StatCard icon={IndianRupee} label="Revenue collected" value={`₹${summary.revenueCollected}`} tint="bg-success-soft text-success" />
            <StatCard icon={Receipt} label="Total bookings (all-time)" value={summary.totalOrders} tint="bg-muted text-foreground" />
            <StatCard icon={FileClock} label="Reports awaiting approval" value={summary.pendingReportsApproval} tint="bg-muted text-foreground" />
            <StatCard icon={UserPlus} label="New patients this week" value={summary.newPatientsThisWeek} tint="bg-muted text-foreground" />
            <StatCard icon={Wallet} label="Revenue this month" value={`₹${summary.revenueThisMonth}`} tint="bg-muted text-foreground" />
          </>
        ) : (
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Revenue — last 7 days</h2>
          {summary ? (
            <div className="mt-5">
              <RevenueTrend trend={summary.revenueTrend} />
            </div>
          ) : (
            <div className="mt-5 h-40 animate-pulse rounded-xl bg-muted" />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Bookings by status</h2>
          {summary ? (
            <div className="mt-4 space-y-3">
              {Object.entries(summary.ordersByStatus).length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                Object.entries(summary.ordersByStatus).map(([status, count]) => (
                  <BreakdownRow key={status} label={statusMeta[status]?.label ?? status} count={count} total={totalOrdersByStatus} />
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Payment method</h2>
          {summary ? (
            <div className="mt-4 space-y-3">
              {Object.entries(summary.paymentMethodBreakdown).map(([method, count]) => (
                <BreakdownRow key={method} label={method === "ONLINE" ? "Online" : "Cash on Delivery"} count={count} total={totalPaymentMethods} />
              ))}
            </div>
          ) : (
            <div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Collection type</h2>
          {summary ? (
            <div className="mt-4 space-y-3">
              {Object.entries(summary.collectionTypeBreakdown).map(([type, count]) => (
                <BreakdownRow key={type} label={type === "HOME" ? "Home collection" : "Collection centre"} count={count} total={totalCollectionTypes} />
              ))}
            </div>
          ) : (
            <div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Recent bookings</h2>
          <Link to="/admin/bookings" className="text-xs font-bold text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          {summary ? (
            summary.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    <th className="pb-2.5 font-bold">Order</th>
                    <th className="pb-2.5 font-bold">Patient</th>
                    <th className="pb-2.5 font-bold">Payment</th>
                    <th className="pb-2.5 text-right font-bold">Amount</th>
                    <th className="pb-2.5 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentOrders.map((o) => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5">
                        <Link to="/admin/bookings/$orderId" params={{ orderId: o.id }} className="font-bold hover:underline">
                          {o.orderNumber}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </p>
                      </td>
                      <td className="py-2.5">
                        <p className="font-semibold">{o.patientName || o.patientPhone}</p>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{o.paymentMethod}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums">₹{o.total}</td>
                      <td className="py-2.5 text-right">
                        <StatusBadge tone={statusMeta[o.status]?.tone ?? "secondary"}>
                          {statusMeta[o.status]?.label ?? o.status}
                        </StatusBadge>
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
    </AdminLayout>
  );
}
