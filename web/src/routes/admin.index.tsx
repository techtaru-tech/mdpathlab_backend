import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  FileCheck2,
  FileClock,
  IndianRupee,
  Receipt,
  Truck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { LabPerformanceTable } from "@/components/admin/LabPerformanceTable";
import { DashboardPeriodFilter, periodRange, todayIst, type Period } from "@/components/admin/DashboardPeriodFilter";
import { adminDashboardApi, type DashboardReport, type DashboardSummary } from "@/lib/admin-api";
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

function TrendChart({ report }: { report: DashboardReport }) {
  const max = Math.max(1, ...report.trend.map((t) => t.revenue));
  // Long daily periods get a label every few bars so the dates stay readable.
  const labelEvery = Math.max(1, Math.ceil(report.trend.length / 10));
  const label = (key: string) =>
    report.bucket === "month"
      ? new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("en-IN", { timeZone: "UTC", month: "short", year: "2-digit" })
      : new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" });
  return (
    <div className="flex h-40 items-end gap-1.5">
      {report.trend.map((t, i) => (
        <div key={t.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end">
            <div
              className="w-full rounded-md bg-primary/80 transition-all"
              style={{ height: `${Math.max(4, Math.round((t.revenue / max) * 100))}%` }}
              title={`${label(t.key)}: ₹${t.revenue} · ${t.bookings} booking${t.bookings === 1 ? "" : "s"}`}
            />
          </div>
          <span className="h-3 text-[10px] font-bold whitespace-nowrap text-muted-foreground">
            {i % labelEvery === 0 ? label(t.key) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </div>
  );
}

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
// While the period includes today its figures keep changing, so they are refreshed in the background.
const LIVE_REFRESH_MS = 60_000;

function AdminDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>(() => {
    const today = todayIst();
    return { mode: "daily", anchor: today, from: today, to: today };
  });
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    adminDashboardApi
      .summary()
      .then(setSummary)
      .catch(() => setError("Couldn't load dashboard — check you're signed in"));
  }, []);

  const range = periodRange(period);
  const from = range?.from;
  const to = range?.to;

  // Every change of period reloads the report; an older answer arriving late is ignored.
  useEffect(() => {
    if (!from || !to) return;
    let current = true;
    const load = (background: boolean) => {
      if (!background) setReportLoading(true);
      adminDashboardApi
        .report(from, to)
        .then((r) => {
          if (!current) return;
          setReport(r);
          setReportError("");
        })
        .catch((err) => {
          if (current && !background) setReportError(err instanceof Error && err.message ? err.message : "Couldn't load the report");
        })
        .finally(() => {
          if (current && !background) setReportLoading(false);
        });
    };
    load(false);
    const today = todayIst();
    const timer = from <= today && today <= to ? window.setInterval(() => load(true), LIVE_REFRESH_MS) : undefined;
    return () => {
      current = false;
      if (timer) window.clearInterval(timer);
    };
  }, [from, to]);

  const shown = report && report.from === from && report.to === to ? report : null;

  return (
    <AdminLayout activePath="/admin">
      <AdminPageHeader title="Overview" description="What needs attention now, and how any day, week, month or date range went." />

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p>
      ) : null}

      {/* Right now — not tied to the chosen period */}
      <h2 className="mt-6 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Right now</h2>
      <div className="mt-3 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {summary ? (
          <>
            <StatCard icon={CalendarCheck} label="Today's bookings" value={summary.todaysBookings} tint="bg-primary-soft text-primary" />
            <StatCard icon={Truck} label="Pending assignment" value={summary.pendingAssignment} tint="bg-warning/15 text-warning" />
            <StatCard icon={FileClock} label="Reports awaiting approval" value={summary.pendingReportsApproval} tint="bg-muted text-foreground" />
            <StatCard icon={Users} label="Total patients" value={summary.totalPatients} tint="bg-secondary-soft text-secondary" />
            <StatCard icon={Receipt} label="Total bookings (all-time)" value={summary.totalOrders} tint="bg-muted text-foreground" />
            <StatCard icon={IndianRupee} label="Revenue (all-time)" value={`₹${summary.revenueCollected}`} tint="bg-success-soft text-success" />
          </>
        ) : (
          [0, 1, 2, 3, 4, 5].map((i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Report for the chosen period */}
      <h2 className="mt-8 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Reports</h2>
      <div className="mt-3">
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </div>

      {reportError ? (
        <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{reportError}</p>
      ) : null}

      <div className={cn("transition-opacity", reportLoading && shown ? "opacity-60" : "")}>
        <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {shown ? (
            <>
              <StatCard icon={Receipt} label="Bookings" value={shown.bookings} tint="bg-primary-soft text-primary" />
              <StatCard icon={IndianRupee} label="Revenue collected" value={`₹${shown.revenue}`} tint="bg-success-soft text-success" />
              <StatCard icon={Wallet} label="Average paid booking" value={`₹${shown.averageBookingValue}`} tint="bg-muted text-foreground" />
              <StatCard icon={UserPlus} label="New patients" value={shown.newPatients} tint="bg-secondary-soft text-secondary" />
              <StatCard icon={FileCheck2} label="Reports released" value={shown.reportsReleased} tint="bg-muted text-foreground" />
              <StatCard icon={XCircle} label="Cancelled bookings" value={shown.cancelled} tint="bg-destructive/10 text-destructive" />
            </>
          ) : (
            [0, 1, 2, 3, 4, 5].map((i) => <StatCardSkeleton key={i} />)
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel title={shown?.bucket === "month" ? "Revenue — month by month" : "Revenue — day by day"}>
            {shown ? (
              <div className="mt-5">
                <TrendChart report={shown} />
              </div>
            ) : (
              <div className="mt-5 h-40 animate-pulse rounded-xl bg-muted" />
            )}
          </Panel>

          <Panel title="Bookings by status">
            {shown ? (
              <div className="mt-4 space-y-3">
                {Object.entries(shown.ordersByStatus).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings in this period.</p>
                ) : (
                  Object.entries(shown.ordersByStatus).map(([status, count]) => (
                    <BreakdownRow key={status} label={statusMeta[status]?.label ?? status} count={count} total={sum(shown.ordersByStatus)} />
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
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Payment method">
            {shown ? (
              <div className="mt-4 space-y-3">
                {Object.entries(shown.paymentMethodBreakdown).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings in this period.</p>
                ) : (
                  Object.entries(shown.paymentMethodBreakdown).map(([method, count]) => (
                    <BreakdownRow key={method} label={method === "ONLINE" ? "Online" : "Cash on Delivery"} count={count} total={sum(shown.paymentMethodBreakdown)} />
                  ))
                )}
              </div>
            ) : (
              <div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />
            )}
          </Panel>

          <Panel title="Collection type">
            {shown ? (
              <div className="mt-4 space-y-3">
                {Object.entries(shown.collectionTypeBreakdown).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings in this period.</p>
                ) : (
                  Object.entries(shown.collectionTypeBreakdown).map(([type, count]) => (
                    <BreakdownRow key={type} label={type === "HOME" ? "Home collection" : "Collection centre"} count={count} total={sum(shown.collectionTypeBreakdown)} />
                  ))
                )}
              </div>
            ) : (
              <div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />
            )}
          </Panel>
        </div>

        <LabPerformanceTable from={from} to={to} />

        <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
              {shown && shown.bookings > shown.recentOrders.length ? `Latest ${shown.recentOrders.length} of ${shown.bookings} bookings` : "Bookings in this period"}
            </h2>
            <Link to="/admin/bookings" className="text-xs font-bold text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            {shown ? (
              shown.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings in this period.</p>
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
                    {shown.recentOrders.map((o) => (
                      <tr key={o.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5">
                          <Link to="/admin/bookings/$orderId" params={{ orderId: o.id }} className="font-bold hover:underline">
                            {o.orderNumber}
                          </Link>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
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
      </div>
    </AdminLayout>
  );
}
