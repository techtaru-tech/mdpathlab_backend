import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PeriodMode = "daily" | "weekly" | "monthly" | "custom";

/**
 * The admin dashboard's period: `anchor` is the chosen day (daily), any day of the chosen week (weekly, Monday to
 * Sunday) or any day of the chosen month (monthly); custom uses `from`/`to`. All dates are IST calendar dates.
 */
export type Period = { mode: PeriodMode; anchor: string; from: string; to: string };

const DAY_MS = 24 * 60 * 60 * 1000;
// The longest period the API accepts (a year, plus a leap day).
export const MAX_CUSTOM_DAYS = 366;

/** Today's date in India, whatever the browser's own time zone. */
export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(date: string): string {
  return addDays(addMonths(date, 1), -1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/** The from/to dates the chosen period covers, or null while a custom range is incomplete or invalid. */
export function periodRange(p: Period): { from: string; to: string } | null {
  if (p.mode === "daily") return { from: p.anchor, to: p.anchor };
  if (p.mode === "weekly") {
    const weekday = (new Date(`${p.anchor}T00:00:00.000Z`).getUTCDay() + 6) % 7; // Monday = 0
    const from = addDays(p.anchor, -weekday);
    return { from, to: addDays(from, 6) };
  }
  if (p.mode === "monthly") return { from: `${p.anchor.slice(0, 7)}-01`, to: lastDayOfMonth(p.anchor) };
  if (!p.from || !p.to || p.from > p.to || daysBetween(p.from, p.to) > MAX_CUSTOM_DAYS) return null;
  return { from: p.from, to: p.to };
}

export function customRangeError(p: Period): string {
  if (p.mode !== "custom" || !p.from || !p.to) return "";
  if (p.from > p.to) return "The start date must be on or before the end date.";
  if (daysBetween(p.from, p.to) > MAX_CUSTOM_DAYS) return "Choose a period of at most one year.";
  return "";
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });

/** "5 Nov 2026", "3 Nov – 9 Nov 2026", "November 2026" or "1 Oct 2026 – 5 Nov 2026". */
export function periodLabel(p: Period): string {
  const r = periodRange(p);
  if (!r) return "";
  if (p.mode === "monthly") return fmt(r.from, { month: "long", year: "numeric" });
  if (r.from === r.to) return fmt(r.from, { day: "numeric", month: "short", year: "numeric" });
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${fmt(r.from, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${fmt(r.to, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "custom", label: "Custom range" },
];

const inputClass = "h-10 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none";

export function DashboardPeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const today = todayIst();
  const range = periodRange(value);
  // Nothing after today has happened yet, so "next" stops at the period that contains today.
  const canGoNext = range ? range.to < today : false;

  function step(direction: 1 | -1) {
    const anchor =
      value.mode === "daily"
        ? addDays(value.anchor, direction)
        : value.mode === "weekly"
          ? addDays(value.anchor, 7 * direction)
          : addMonths(value.anchor, direction);
    onChange({ ...value, anchor: anchor > today ? today : anchor });
  }

  function chooseMode(mode: PeriodMode) {
    if (mode === value.mode) return;
    // Starting a custom range from whatever is on screen is easier than from blank dates.
    if (mode === "custom" && range) onChange({ ...value, mode, from: range.from, to: range.to });
    else onChange({ ...value, mode });
  }

  const error = customRangeError(value);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-xl bg-muted p-1" role="tablist" aria-label="Report period">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={value.mode === m.id}
              onClick={() => chooseMode(m.id)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors",
                value.mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {value.mode === "custom" ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              From
              <input
                type="date"
                value={value.from}
                max={today}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              To
              <input
                type="date"
                value={value.to}
                max={today}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous period"
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {value.mode === "monthly" ? (
              <input
                type="month"
                value={value.anchor.slice(0, 7)}
                max={today.slice(0, 7)}
                onChange={(e) => e.target.value && onChange({ ...value, anchor: `${e.target.value}-01` })}
                className={inputClass}
                aria-label="Month"
              />
            ) : (
              <input
                type="date"
                value={value.anchor}
                max={today}
                onChange={(e) => e.target.value && onChange({ ...value, anchor: e.target.value })}
                className={inputClass}
                aria-label={value.mode === "weekly" ? "Any day in the week" : "Day"}
              />
            )}
            <button
              type="button"
              onClick={() => step(1)}
              disabled={!canGoNext}
              aria-label="Next period"
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {value.anchor !== today && !(range && range.from <= today && today <= range.to) ? (
              <button
                type="button"
                onClick={() => onChange({ ...value, anchor: today })}
                className="text-xs font-bold text-primary hover:underline"
              >
                {value.mode === "daily" ? "Today" : value.mode === "weekly" ? "This week" : "This month"}
              </button>
            ) : null}
          </div>
        )}
      </div>
      <p className={cn("mt-3 text-sm font-semibold", error ? "text-destructive" : "text-muted-foreground")}>
        {error || (range ? `Showing ${periodLabel(value)}` : "Choose a start and an end date.")}
      </p>
    </div>
  );
}
