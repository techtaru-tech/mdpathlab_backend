import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { adminDashboardApi, type LabPerformanceRow } from "@/lib/admin-api";

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Each partner lab's (franchise's) bookings, revenue and reports for the dashboard's chosen period. */
export function LabPerformanceTable({ from, to }: { from: string | undefined; to: string | undefined }) {
  const [rows, setRows] = useState<LabPerformanceRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to) return;
    let current = true;
    setError("");
    adminDashboardApi
      .labs(from, to)
      .then((r) => current && setRows(r.labs))
      .catch(() => current && setError("Couldn't load lab performance"));
    return () => {
      current = false;
    };
  }, [from, to]);

  const totals = rows?.reduce(
    (t, r) => ({ bookings: t.bookings + r.bookings, revenue: t.revenue + r.revenue, due: t.due + r.due, completed: t.completed + r.completed }),
    { bookings: 0, revenue: 0, due: 0, completed: 0 },
  );

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
          <Building2 className="h-4 w-4" /> Lab / franchise performance
        </h2>
        {totals ? (
          <p className="text-xs text-muted-foreground">
            {totals.bookings} bookings · {money(totals.revenue)} collected · {money(totals.due)} due
          </p>
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        {error ? (
          <p className="text-sm font-semibold text-destructive">{error}</p>
        ) : !rows ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No partner labs yet.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                <th className="pb-2.5 font-bold">Lab</th>
                <th className="pb-2.5 text-right font-bold">Bookings</th>
                <th className="pb-2.5 text-right font-bold">Completed</th>
                <th className="pb-2.5 text-right font-bold">Cancelled</th>
                <th className="pb-2.5 text-right font-bold">Revenue collected</th>
                <th className="pb-2.5 text-right font-bold" title="Still to be collected on bookings that are not cancelled">
                  Due
                </th>
                <th className="pb-2.5 text-right font-bold">Avg paid booking</th>
                <th className="pb-2.5 text-right font-bold">Home visits</th>
                <th className="pb-2.5 text-right font-bold">Reports released</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.labId ?? "none"} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5">
                    <p className={r.labId ? "font-bold" : "font-semibold text-muted-foreground"}>{r.name}</p>
                    {r.status && r.status !== "ACTIVE" ? <p className="text-[11px] text-muted-foreground">{r.status.toLowerCase()}</p> : null}
                  </td>
                  <td className="py-2.5 text-right font-bold tabular-nums">{r.bookings}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.completed}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.cancelled}</td>
                  <td className="py-2.5 text-right font-bold text-success tabular-nums">{money(r.revenue)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(r.due)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(r.averageBookingValue)}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.homeVisits}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.reportsReleased}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
