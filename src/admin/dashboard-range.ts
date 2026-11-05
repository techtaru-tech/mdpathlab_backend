import { BadRequestException } from '@nestjs/common';
import { istInstant, isValidCalendarDateString, todayIstDateString } from '../common/ist-time.js';

/** Longest period the dashboard report covers in one go (a year, plus a leap day). */
export const MAX_RANGE_DAYS = 366;
/** Up to this many days the trend is one bar per day; longer periods get one bar per month. */
export const DAILY_BUCKET_MAX_DAYS = 62;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export type DashboardRange = {
  from: string;
  to: string;
  days: number;
  /** Start of `from` and start of the day after `to`, both in IST — query with gte start, lt end. */
  start: Date;
  end: Date;
  bucket: 'day' | 'month';
};

/**
 * The admin's chosen period, as IST calendar dates (both inclusive). Missing dates mean today; a lone date is a
 * one-day period. Anything malformed, reversed or longer than a year is refused rather than silently adjusted.
 */
export function parseDashboardRange(from?: string, to?: string, now: Date = new Date()): DashboardRange {
  const today = todayIstDateString(now);
  const f = from || to || today;
  const t = to || from || today;
  if (!isValidCalendarDateString(f) || !isValidCalendarDateString(t)) throw new BadRequestException('Dates must be YYYY-MM-DD');
  if (f > t) throw new BadRequestException('The start date must be on or before the end date');
  const days = Math.round((Date.parse(`${t}T00:00:00.000Z`) - Date.parse(`${f}T00:00:00.000Z`)) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Choose a period of at most ${MAX_RANGE_DAYS} days`);
  return {
    from: f,
    to: t,
    days,
    start: istInstant(f, '00:00'),
    end: istInstant(addDays(t, 1), '00:00'),
    bucket: days <= DAILY_BUCKET_MAX_DAYS ? 'day' : 'month',
  };
}

/** The trend's buckets, in order, every one present (zero when nothing happened): "YYYY-MM-DD" or "YYYY-MM". */
export function trendBuckets(range: DashboardRange): string[] {
  const keys: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const key = range.bucket === 'day' ? d : d.slice(0, 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

/** Which bucket an instant falls in, by its IST calendar date. */
export function bucketOf(at: Date, bucket: DashboardRange['bucket']): string {
  const day = todayIstDateString(at);
  return bucket === 'day' ? day : day.slice(0, 7);
}
