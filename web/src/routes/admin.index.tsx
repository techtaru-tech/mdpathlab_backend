import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, IndianRupee, Truck, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminDashboardApi, type DashboardSummary } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: AdminDashboardPage,
});

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PHLEBOTOMIST_ASSIGNED: "Phlebotomist assigned",
  SAMPLE_COLLECTED: "Sample collected",
  IN_LAB: "In lab",
  REPORT_READY: "Report ready",
  CANCELLED: "Cancelled",
};

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

  return (
    <AdminLayout activePath="/admin">
      <h1 className="text-2xl font-extrabold">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">A snapshot of today's operations.</p>

      {error ? <p className="mt-6 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${s.tint}`}>
              <s.icon className="h-4.5 w-4.5" />
            </span>
            <p className="mt-3 text-2xl font-extrabold">{s.value}</p>
            <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {summary ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Bookings by status</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(summary.ordersByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
                <span className="text-sm font-semibold">{statusLabels[status] ?? status}</span>
                <span className="text-sm font-extrabold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
