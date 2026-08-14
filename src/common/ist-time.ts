// India does not observe daylight saving time, so IST is a fixed UTC+05:30 offset year-round —
// no IANA timezone database or library is needed for correctness, just consistent construction.
// This is the ONE authoritative place past-time/availability decisions are computed; do not
// reintroduce `new Date().toISOString().slice(0, 10)` (UTC calendar date) or bare `setHours()`
// (server-local time) for this purpose elsewhere — mixing those two bases is exactly what caused
// the ~5.5-hour daily boundary bug (00:00–05:30 IST) found in the slot-availability audit.

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY_PATTERN = /^\d{2}:\d{2}$/;

export function isValidCalendarDateString(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  // Rejects e.g. "2026-02-30" — the Date constructor silently rolls invalid day-of-month values
  // into the next month, so round-tripping back to the same string catches that.
  return instant.toISOString().slice(0, 10) === value;
}

/** The real, absolute instant a slot starts, expressed in India Standard Time. */
export function istInstant(dateStr: string, time: string): Date {
  if (!TIME_ONLY_PATTERN.test(time)) throw new Error(`Invalid time string: ${time}`);
  return new Date(`${dateStr}T${time}:00+05:30`);
}

/** True if the given slot's start time, on the given date, is already in the past (IST). */
export function isPastIstSlot(dateStr: string, time: string, now: Date = new Date()): boolean {
  return istInstant(dateStr, time).getTime() <= now.getTime();
}

/** "Today" as a calendar-date string, per India Standard Time — never via toISOString(). */
export function todayIstDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}
