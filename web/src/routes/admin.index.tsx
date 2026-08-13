import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, IndianRupee, Truck, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { adminDashboardApi, type DashboardSummary } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: AdminDashboardPage,
});

const statusMeta: Record<string, { label: string; tint: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tint: "bg-warning" },
  CONFIRMED: { label: "Confirmed", tint: "bg-success" },
  PHLEBOTOMIST_ASSIGNED: { label: "Phlebotomist assigned", tint: "bg-primary" },
  SAMPLE_COLLECTED: { label: "Sample collected", tint: "bg-secondary" },
  IN_LAB: { label: "In lab", tint: "bg-secondary" },
  REPORT_READY: { label: "Report ready", tint: "bg-success" },
  CANCELLED: { label: "Cancelled", tint: "bg-destructive" },
};

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
      <div className="mt-4 h-7 w-14 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
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

  const stats = summary
    ? [
        { icon: CalendarCheck, label: "Today's bookings", value: summary.todaysBookings, tint: "bg-primary-soft text-primary" },
        { icon: Truck, label: "Pending assignment", value: summary.pendingAssignment, tint: "bg-warning/15 text-warning" },
        { icon: Users, label: "Total patients", value: summary.totalPatients, tint: "bg-secondary-soft text-secondary" },
        { icon: IndianRupee, label: "Revenue collected", value: `₹${summary.revenueCollected}`, tint: "bg-success-soft text-success" },
      ]
    : [];

  const totalOrders = summary ? Object.values(summary.ordersByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <AdminLayout activePath="/admin">
      <AdminPageHeader title="Overview" description="A snapshot of today's operations." />

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary
          ? stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl", s.tint)}>
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <p className="mt-3 text-2xl font-extrabold tabular-nums">{s.value}</p>
                <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
              </div>
            ))
          : [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Bookings by status</h2>
          {summary ? (
            <div className="mt-4 space-y-3">
              {Object.entries(summary.ordersByStatus).length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                Object.entries(summary.ordersByStatus).map(([status, count]) => {
                  const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                  const meta = statusMeta[status] ?? { label: status, tint: "bg-muted-foreground" };
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="font-extrabold tabular-nums">{count}</span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", meta.tint)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
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

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Quick links</h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/admin/bookings" className="rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:border-primary/40 hover:bg-primary-soft">
              Manage bookings
            </Link>
            <Link to="/admin/patients" className="rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:border-primary/40 hover:bg-primary-soft">
              View patients
            </Link>
            <Link to="/admin/phlebotomists" className="rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:border-primary/40 hover:bg-primary-soft">
              Manage phlebotomists
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
