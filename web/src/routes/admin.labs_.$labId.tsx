import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FlaskConical,
  Hourglass,
  IndianRupee,
  MapPin,
  Phone,
  ReceiptText,
  Star,
  Timer,
  Truck,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminApiError, adminLabsApi, type LabDashboard, type LabDashboardRange } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/labs_/$labId")({
  head: () => ({ meta: [{ title: "Lab — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminLabDashboardPage,
});

const RANGES: { key: LabDashboardRange; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "365d", label: "1 year" },
  { key: "all", label: "All time" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PHLEBOTOMIST_ASSIGNED: "Phlebotomist assigned",
  SAMPLE_COLLECTED: "Sample collected",
  IN_LAB: "In lab",
  REPORT_READY: "Report ready",
  CANCELLED: "Cancelled",
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "primary" | "secondary" | "neutral"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "primary",
  PHLEBOTOMIST_ASSIGNED: "primary",
  SAMPLE_COLLECTED: "secondary",
  IN_LAB: "secondary",
  REPORT_READY: "success",
  CANCELLED: "danger",
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const compactRupees = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${n}`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function AdminLabDashboardPage() {
  const { labId } = Route.useParams();
  const [range, setRange] = useState<LabDashboardRange>("30d");
  const [picked, setPicked] = useState(false);
  const [data, setData] = useState<LabDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setError("");
    adminLabsApi
      .dashboard(labId, range)
      .then((d) => {
        if (!current) return;
        // Nothing in the last 30 days but older bookings exist: open on "All time" instead of an empty page.
        if (!picked && range === "30d" && d.kpis.bookings === 0 && d.lifetime.bookings > 0) {
          setRange("all");
          return;
        }
        setData(d);
      })
      .catch((err) => current && setError(err instanceof AdminApiError ? err.message : "Couldn't load this lab"));
    return () => {
      current = false;
    };
  }, [labId, range]);

  return (
    <AdminLayout activePath="/admin/labs">
      <Link to="/admin/labs" className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> All labs
      </Link>
      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}
      {!data && !error ? <div className="mt-5 h-96 animate-pulse rounded-2xl bg-muted" /> : null}
      {data ? (
        <Dashboard
          data={data}
          range={range}
          onRange={(r) => {
            setPicked(true);
            setRange(r);
          }}
        />
      ) : null}
    </AdminLayout>
  );
}

function Dashboard({ data, range, onRange }: { data: LabDashboard; range: LabDashboardRange; onRange: (r: LabDashboardRange) => void }) {
  const { lab, kpis } = data;
  return (
    <div className="mt-4 space-y-6">
      <LabHeader data={data} />

      {/* Period — one row, above everything it filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-muted p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onRange(r.key)}
              className={cn("rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors", range === r.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {data.from ? `Since ${fmtDate(data.from)}` : `Since the lab joined (${fmtDate(lab.createdAt)})`} · lifetime {data.lifetime.bookings} bookings, {rupees(data.lifetime.revenue)}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={IndianRupee} label="Revenue booked" value={rupees(kpis.bookedRevenue)} sub={`${kpis.activeBookings} bookings (not cancelled)`} highlight />
        <Kpi icon={CircleDollarSign} label="Collected" value={rupees(kpis.paidRevenue)} sub={kpis.bookedRevenue ? `${Math.round((kpis.paidRevenue / kpis.bookedRevenue) * 100)}% of booked` : "—"} />
        <Kpi icon={Hourglass} label="Payment pending" value={rupees(kpis.pendingRevenue)} sub={`${kpis.pendingBookings} booking${kpis.pendingBookings === 1 ? "" : "s"} unpaid`} />
        <Kpi icon={ReceiptText} label="Average order" value={rupees(kpis.averageOrderValue)} sub={kpis.refunded ? `${rupees(kpis.refunded)} refunded` : "per booking"} />
        <Kpi icon={ClipboardList} label="Bookings" value={kpis.bookings.toLocaleString("en-IN")} sub={`${kpis.patients} patient${kpis.patients === 1 ? "" : "s"}`} />
        <Kpi icon={BadgeCheck} label="Reports delivered" value={kpis.completed.toLocaleString("en-IN")} sub={kpis.activeBookings ? `${Math.round((kpis.completed / kpis.activeBookings) * 100)}% of bookings` : "—"} />
        <Kpi
          icon={Timer}
          label="Report turnaround"
          value={kpis.reportTurnaroundHours != null ? `${kpis.reportTurnaroundHours} h` : "—"}
          sub={kpis.reportsTimed ? `avg, sample → report (${kpis.reportsTimed})` : "no reports yet"}
        />
        <Kpi icon={XCircle} label="Cancelled" value={`${kpis.cancellationRate}%`} sub={`${kpis.cancelled} booking${kpis.cancelled === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <TrendCard data={data} />
        <OperationsCard data={data} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatusCard data={data} />
        <TopTestsCard data={data} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TeamCard data={data} />
        <CoverageCard data={data} />
      </div>

      <RecentCard data={data} />
    </div>
  );
}

function LabHeader({ data }: { data: LabDashboard }) {
  const { lab } = data;
  const rows: [typeof MapPin, string, string | null][] = [
    [UserRound, "Owner", lab.ownerName],
    [Phone, "Contact", [lab.phone, lab.email].filter(Boolean).join(" · ")],
    [MapPin, "Address", lab.address],
    [BadgeCheck, "Accreditation", lab.accreditationNumber],
    [FlaskConical, "Pathologist", [lab.pathologistName, lab.pathologistQualification].filter(Boolean).join(", ") || null],
    [CalendarClock, "Joined", fmtDate(lab.createdAt)],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-primary-deep to-primary px-6 py-5 text-primary-foreground">
        <div>
          <p className="text-[11px] font-bold tracking-wider uppercase opacity-80">Partner lab</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{lab.name}</h1>
          <p className="mt-1 text-sm opacity-85">{lab.servicePincodes.length} service pincode{lab.servicePincodes.length === 1 ? "" : "s"} · {data.phlebotomists.length} phlebotomist{data.phlebotomists.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", lab.status === "ACTIVE" ? "bg-success/90 text-white" : "bg-destructive/90 text-white")}>{lab.status === "ACTIVE" ? "Active" : "Inactive"}</span>
          {lab.lat != null && lab.lng != null ? (
            <a href={`https://www.google.com/maps?q=${lab.lat},${lab.lng}`} target="_blank" rel="noreferrer" className="text-xs font-bold underline-offset-2 opacity-90 hover:underline">
              Open map pin ↗
            </a>
          ) : (
            <span className="text-xs opacity-80">No map pin set</span>
          )}
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="text-[11px] font-bold text-muted-foreground uppercase">{label}</dt>
              <dd className="text-sm font-semibold break-words">{value || "—"}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, highlight }: { icon: typeof Users; label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-5 shadow-sm", highlight ? "border-primary/30 bg-primary-soft" : "border-border bg-card")}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

/** One series at a time (revenue OR bookings) — never two scales on one chart. */
function TrendCard({ data }: { data: LabDashboard }) {
  const [metric, setMetric] = useState<"revenue" | "bookings">("revenue");
  const monthly = data.series.granularity === "month";
  const points = useMemo(
    () =>
      data.series.points.map((p) => ({
        ...p,
        label: monthly
          ? new Date(p.date + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
          : new Date(p.date + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      })),
    [data, monthly],
  );
  const total = points.reduce((a, p) => a + p[metric], 0);
  const empty = total === 0;

  return (
    <Card
      title={`${metric === "revenue" ? "Revenue" : "Bookings"} by ${monthly ? "month" : "day"}`}
      right={
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["revenue", "bookings"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn("rounded-md px-3 py-1 text-xs font-bold", metric === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {m === "revenue" ? "Revenue" : "Bookings"}
            </button>
          ))}
        </div>
      }
    >
      <p className="-mt-2 mb-3 text-2xl font-extrabold">{metric === "revenue" ? rupees(total) : total.toLocaleString("en-IN")}</p>
      {empty ? (
        <p className="grid h-56 place-items-center rounded-xl bg-muted/40 text-sm text-muted-foreground">No bookings in this period.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={points.length > 40 ? 1 : 3}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => (metric === "revenue" ? compactRupees(v) : String(v))}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as (typeof points)[number];
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                      <p className="font-bold">{p.label}</p>
                      <p className="mt-1">
                        <span className="text-muted-foreground">Revenue </span>
                        <span className="font-bold">{rupees(p.revenue)}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Bookings </span>
                        <span className="font-bold">{p.bookings}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey={metric} fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function OperationsCard({ data }: { data: LabDashboard }) {
  const o = data.operations;
  const rows: [typeof Clock, string, number, string][] = [
    [CalendarClock, "Scheduled today", o.scheduledToday, "visits / centre bookings for today"],
    [Truck, "Waiting for collection", o.awaitingCollection, "confirmed or phlebotomist assigned"],
    [FlaskConical, "Sample in process", o.inProcess, "collected or in the lab"],
    [ClipboardList, "Reports to finish", o.reportsPending, "pending or awaiting approval"],
  ];
  return (
    <Card title="Right now">
      <ul className="space-y-3">
        {rows.map(([Icon, label, n, hint]) => (
          <li key={label} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
            </div>
            <p className="text-xl font-extrabold">{n}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Live counts — not affected by the period.</p>
    </Card>
  );
}

function StatusCard({ data }: { data: LabDashboard }) {
  const max = Math.max(1, ...data.statusBreakdown.map((s) => s.count));
  const split = data.collectionSplit;
  return (
    <Card title="Bookings by status">
      {data.statusBreakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings in this period.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.statusBreakdown.map((s) => (
            <li key={s.status} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate font-semibold">{STATUS_LABEL[s.status] ?? s.status}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", s.status === "CANCELLED" ? "bg-destructive/70" : "bg-primary")} style={{ width: `${(s.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-bold">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
      {split.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          {(["HOME", "CENTER"] as const).map((t) => {
            const row = split.find((x) => x.type === t);
            return (
              <div key={t} className="rounded-xl bg-muted/50 p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">{t === "HOME" ? "Home collection" : "Centre visit"}</p>
                <p className="mt-0.5 text-lg font-extrabold">{row?.bookings ?? 0}</p>
                <p className="text-xs text-muted-foreground">{rupees(row?.revenue ?? 0)}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

function TopTestsCard({ data }: { data: LabDashboard }) {
  const max = Math.max(1, ...data.topTests.map((t) => t.bookings));
  return (
    <Card title="Top tests">
      {data.topTests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tests booked in this period.</p>
      ) : (
        <ul className="space-y-3">
          {data.topTests.map((t, i) => (
            <li key={t.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">
                  <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                  {t.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <b className="text-foreground">{t.bookings}</b> · {rupees(t.revenue)}
                </span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(t.bookings / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TeamCard({ data }: { data: LabDashboard }) {
  const k = data.kpis;
  return (
    <Card
      title="Phlebotomists"
      right={
        k.phlebotomistRating != null ? (
          <span className="flex items-center gap-1 text-xs font-bold">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" /> {k.phlebotomistRating} <span className="font-normal text-muted-foreground">({k.ratingsCount} ratings)</span>
          </span>
        ) : null
      }
    >
      {data.phlebotomists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No phlebotomists added for this lab.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.phlebotomists.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.phone}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                {p.rating != null ? (
                  <span className="flex items-center gap-0.5 font-bold">
                    <Star className="h-3 w-3 fill-warning text-warning" /> {p.rating.toFixed(1)}
                  </span>
                ) : null}
                <span className="text-muted-foreground">{p.bookings} visits</span>
                <StatusBadge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status === "ACTIVE" ? "Active" : p.status.toLowerCase()}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CoverageCard({ data }: { data: LabDashboard }) {
  const c = data.coverage;
  const cat: [string, number][] = [
    ["Tests", c.catalogue.PARAMETER ?? 0],
    ["Profiles", c.catalogue.PROFILE ?? 0],
    ["Packages", c.catalogue.PACKAGE ?? 0],
    ["Radiology", c.catalogue.RADIOLOGY ?? 0],
  ];
  return (
    <Card title="Coverage & catalogue">
      <div className="grid grid-cols-4 gap-2">
        {cat.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-lg font-extrabold">{n}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-bold text-muted-foreground uppercase">
        Service pincodes ({c.pincodes.length}){c.pendingAreaRequests ? <span className="ml-2 font-bold text-warning normal-case">· {c.pendingAreaRequests} new area request{c.pendingAreaRequests === 1 ? "" : "s"} pending</span> : null}
      </p>
      <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {c.pincodes.length === 0 ? (
          <span className="text-sm text-muted-foreground">None set</span>
        ) : (
          c.pincodes.map((p) => (
            <span key={p} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">
              {p}
            </span>
          ))
        )}
      </div>
    </Card>
  );
}

function RecentCard({ data }: { data: LabDashboard }) {
  return (
    <Card title="Latest bookings" right={<Link to="/admin/bookings" className="text-xs font-bold text-primary hover:underline">All bookings →</Link>}>
      {data.recentBookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase">
                <th className="py-2 pr-3">Booking</th>
                <th className="py-2 pr-3">Patient</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recentBookings.map((o) => (
                <tr key={o.id} className="hover:bg-muted/40">
                  <td className="py-2.5 pr-3">
                    <Link to="/admin/bookings/$orderId" params={{ orderId: o.id }} className="font-bold text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(o.createdAt)}</p>
                  </td>
                  <td className="py-2.5 pr-3">{o.patientName ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{o.collectionType === "HOME" ? "Home" : "Centre"}</td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge tone={STATUS_TONE[o.status] ?? "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                  </td>
                  <td className="py-2.5 text-right font-bold">
                    {rupees(o.total)}
                    <p className={cn("text-[11px] font-semibold", o.paymentStatus === "PAID" ? "text-success" : "text-muted-foreground")}>{o.paymentStatus === "PAID" ? "Paid" : o.paymentStatus === "PENDING" ? "Unpaid" : o.paymentStatus.toLowerCase().replace("_", " ")}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
