// Mirrors src/common/ist-time.ts on the backend — same fixed-offset construction, so the
// frontend's date-picker bounds always agree with what the backend will actually accept/reject.
// India does not observe daylight saving time, so IST (UTC+05:30) is a fixed offset year-round;
// no timezone library is needed, just consistent construction. Do NOT reintroduce
// `new Date().toISOString().slice(0, 10)` here — that's UTC, not IST, and mixing it with local
// `setHours()`-based logic is exactly the ~5.5-hour daily boundary bug (00:00–05:30 IST) this
// replaces.

/** "Today" as a calendar-date string, per India Standard Time. */
export function todayIstDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

/** "Tomorrow" as a calendar-date string, per India Standard Time. */
export function tomorrowIstDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}
