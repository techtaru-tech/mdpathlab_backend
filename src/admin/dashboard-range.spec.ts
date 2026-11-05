import { bucketOf, parseDashboardRange, trendBuckets } from './dashboard-range';

const NOW = new Date('2026-11-04T20:00:00.000Z'); // 5 Nov 01:30 IST — already "tomorrow" in India

describe('dashboard report period', () => {
  it('defaults to today in India, not the UTC date', () => {
    const r = parseDashboardRange(undefined, undefined, NOW);
    expect([r.from, r.to, r.days, r.bucket]).toEqual(['2026-11-05', '2026-11-05', 1, 'day']);
    expect(r.start.toISOString()).toBe('2026-11-04T18:30:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-05T18:30:00.000Z');
  });

  it('a week is seven daily bars, both ends included', () => {
    const r = parseDashboardRange('2026-11-02', '2026-11-08', NOW);
    expect(r.days).toBe(7);
    expect(trendBuckets(r)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('a long custom period is shown month by month', () => {
    const r = parseDashboardRange('2026-01-15', '2026-04-10', NOW);
    expect(r.bucket).toBe('month');
    expect(trendBuckets(r)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(bucketOf(new Date('2026-02-28T19:00:00.000Z'), 'month')).toBe('2026-03'); // 1 Mar 00:30 IST
  });

  it('refuses bad, reversed and over-long periods', () => {
    expect(() => parseDashboardRange('2026-02-30', '2026-03-01', NOW)).toThrow('YYYY-MM-DD');
    expect(() => parseDashboardRange('2026-11-08', '2026-11-02', NOW)).toThrow('on or before');
    expect(() => parseDashboardRange('2025-01-01', '2026-11-01', NOW)).toThrow('at most 366');
  });
});
