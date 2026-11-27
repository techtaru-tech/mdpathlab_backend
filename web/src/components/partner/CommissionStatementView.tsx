import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import {
  COMMISSION_CATEGORIES,
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_CATEGORY_SHORT,
  COMMISSION_ENTRY_LABELS,
  currentIstMonth,
  downloadCsv,
  formatPaise,
  paiseToRupees,
  recentMonths,
  type CommissionCategory,
  type CommissionStatement,
  type EntryCategoryAmount,
  type PartnerMou,
} from "@/lib/partner-api";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const categoryText = (cats: EntryCategoryAmount[]) => cats.map((c) => COMMISSION_CATEGORY_SHORT[c.category]).join(" + ");

/** The partner's MOU rates (Routine / Special / Package) — current, and the next one if it's already agreed. */
export function MouRatesCard({ current, upcoming }: { current: PartnerMou | null; upcoming: PartnerMou | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Your commission rates (MOU)</h2>
      {current ? (
        <>
          <RateGrid mou={current} />
          <p className="mt-2 text-xs text-muted-foreground">In force since {formatDate(current.effectiveFrom)}. Each booking keeps the rate in force when it was booked.</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Your MOU rates have not been set yet. Please contact MD Path Lab.</p>
      )}
      {upcoming ? (
        <div className="mt-4 rounded-xl bg-primary-soft/60 p-3">
          <p className="text-xs font-bold text-primary">New rates from {formatDate(upcoming.effectiveFrom)}</p>
          <RateGrid mou={upcoming} compact />
        </div>
      ) : null}
    </div>
  );
}

function RateGrid({ mou, compact }: { mou: PartnerMou; compact?: boolean }) {
  const rows: [CommissionCategory, number][] = [
    ["ROUTINE", mou.routinePercent],
    ["SPECIAL", mou.specialPercent],
    ["PACKAGE", mou.packagePercent],
  ];
  return (
    <div className={compact ? "mt-2 grid grid-cols-3 gap-2" : "mt-3 grid grid-cols-3 gap-3"}>
      {rows.map(([c, rate]) => (
        <div key={c} className={compact ? "text-center" : "rounded-xl border border-border bg-muted/40 p-3 text-center"}>
          <p className={compact ? "text-base font-extrabold" : "text-2xl font-extrabold text-primary"}>{rate}%</p>
          <p className="text-[11px] font-semibold text-muted-foreground">{COMMISSION_CATEGORY_LABELS[c]}</p>
        </div>
      ))}
    </div>
  );
}

/** Net commission per category (after reversals). */
export function CategoryTotalsCard({ totals, counts }: { totals: Record<CommissionCategory, number>; counts?: { referredBookings: number; earningBookings: number } }) {
  const net = COMMISSION_CATEGORIES.reduce((a, c) => a + totals[c], 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Commission by category</h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {COMMISSION_CATEGORIES.map((c) => (
          <li key={c} className="flex justify-between py-2">
            <span>{COMMISSION_CATEGORY_LABELS[c]}</span>
            <span className="font-bold">{formatPaise(totals[c])}</span>
          </li>
        ))}
        <li className="flex justify-between py-2 font-extrabold">
          <span>Total earned (after reversals)</span>
          <span>{formatPaise(net)}</span>
        </li>
      </ul>
      {counts ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {counts.referredBookings} booking{counts.referredBookings === 1 ? "" : "s"} through your referral code · {counts.earningBookings} completed and earning
        </p>
      ) : null}
    </div>
  );
}

/** Month picker + statement (opening/closing balance, category split, every ledger row) with CSV and print. */
export function MonthlyStatement({ load }: { load: (month: string) => Promise<CommissionStatement> }) {
  const [month, setMonth] = useState(currentIstMonth());
  const [data, setData] = useState<CommissionStatement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    load(month)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the statement"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const months = recentMonths(12);
  const label = months.find((m) => m.value === month)?.label ?? month;

  function csv() {
    if (!data) return;
    const rows: (string | number | null)[][] = [
      ["MD Path Lab — commission statement", label],
      ["Partner", data.partner.displayName ?? "", "Referral code", data.partner.referralCode ?? ""],
      [],
      ["Date", "Type", "Booking", "Category", "Amount (Rs)", "Note"],
      ...data.entries.map((e) => [formatDate(e.createdAt), COMMISSION_ENTRY_LABELS[e.type], e.orderNumber, categoryText(e.categories), paiseToRupees(e.amountPaise), e.note]),
      [],
      ["Opening balance", paiseToRupees(data.openingBalancePaise)],
      ["Commission earned", paiseToRupees(data.totals.earnedPaise)],
      ["Reversed (cancelled / refunded)", paiseToRupees(-data.totals.reversedPaise)],
      ["Adjustments", paiseToRupees(data.totals.adjustmentsPaise)],
      ["Withdrawn", paiseToRupees(-data.totals.withdrawnPaise)],
      ["Closing balance", paiseToRupees(data.closingBalancePaise)],
      [],
      ...COMMISSION_CATEGORIES.map((c) => [COMMISSION_CATEGORY_LABELS[c], paiseToRupees(data.categoryTotals[c])]),
    ];
    downloadCsv(`commission-statement-${month}.csv`, rows);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Monthly statement</h2>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-border bg-muted px-2 text-sm font-semibold">
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={csv} disabled={!data} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Excel (CSV)
          </button>
          <button type="button" onClick={() => window.print()} disabled={!data} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
      {!data && !error ? <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted" /> : null}
      {data ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {label}
            {data.partner.displayName ? ` · ${data.partner.displayName}` : ""}
            {data.partner.referralCode ? ` · code ${data.partner.referralCode}` : ""}
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Mini label="Opening balance" value={formatPaise(data.openingBalancePaise)} />
            <Mini label={`Earned (${data.totals.bookings} booking${data.totals.bookings === 1 ? "" : "s"})`} value={formatPaise(data.totals.earnedPaise)} />
            <Mini label="Reversed" value={data.totals.reversedPaise ? `−${formatPaise(data.totals.reversedPaise)}` : formatPaise(0)} />
            <Mini label="Adjustments" value={formatPaise(data.totals.adjustmentsPaise)} />
            <Mini label="Withdrawn" value={formatPaise(data.totals.withdrawnPaise)} />
            <Mini label="Closing balance" value={formatPaise(data.closingBalancePaise)} strong />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {COMMISSION_CATEGORIES.map((c) => `${COMMISSION_CATEGORY_SHORT[c]} ${formatPaise(data.categoryTotals[c])}`).join(" · ")}
          </p>
          {data.entries.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No activity in this month.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Entry</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.createdAt)}</td>
                      <td className="py-2 pr-3">
                        {COMMISSION_ENTRY_LABELS[e.type]}
                        {e.note ? <span className="block text-xs text-muted-foreground">{e.note}</span> : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{e.orderNumber ?? "—"}</td>
                      <td className="py-2 pr-3">{categoryText(e.categories) || "—"}</td>
                      <td className={e.amountPaise < 0 ? "py-2 text-right font-bold text-destructive" : "py-2 text-right font-bold text-success"}>{formatPaise(e.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "rounded-xl border border-primary/30 bg-primary-soft p-3" : "rounded-xl border border-border p-3"}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-extrabold">{value}</p>
    </div>
  );
}
