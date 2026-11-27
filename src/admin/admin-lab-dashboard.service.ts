import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const LAB_DASHBOARD_RANGES = ['7d', '30d', '90d', '365d', 'all'] as const;
export type LabDashboardRange = (typeof LAB_DASHBOARD_RANGES)[number];

const IST_MS = 5.5 * 3600_000;
const DAYS: Record<Exclude<LabDashboardRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
const OPEN_FOR_COLLECTION = ['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED'] as const;
const IN_PROCESS = ['SAMPLE_COLLECTED', 'IN_LAB'] as const;

/** Start of today in IST, as an instant. */
function istToday(): Date {
  const d = new Date(Date.now() + IST_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_MS);
}

/**
 * Admin → Labs → a lab: everything about one lab on one page — its details, KPIs for a chosen period (bookings,
 * revenue booked / collected / pending, average order, completion and cancellation, report turnaround, patients),
 * a day-by-day (or month-by-month) trend, status split, top tests, its phlebotomists with ratings, what is waiting
 * today, coverage and catalogue, and the latest bookings. Amounts are rupees (as on Order).
 */
@Injectable()
export class AdminLabDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(labId: string, range: LabDashboardRange) {
    const lab = await this.prisma.lab.findUnique({
      where: { id: labId },
      select: {
        id: true, name: true, ownerName: true, email: true, phone: true, address: true, status: true, accreditationNumber: true,
        pathologistName: true, pathologistQualification: true, lat: true, lng: true, servicePincodes: true, createdAt: true,
      },
    });
    if (!lab) throw new NotFoundException('Lab not found');

    const from = range === 'all' ? null : new Date(istToday().getTime() - (DAYS[range] - 1) * 86400_000);
    const inRange: Prisma.OrderWhereInput = { labId, ...(from ? { createdAt: { gte: from } } : {}) };
    const live: Prisma.OrderWhereInput = { ...inRange, status: { not: 'CANCELLED' } };
    const monthly = range === '365d' || range === 'all';
    const today = istToday();
    const tomorrow = new Date(today.getTime() + 86400_000);

    const [
      byStatus, booked, paid, pending, refunded, patients, byType, top, tat, series, ratings,
      todayCount, awaitingCollection, inProcess, reportsPending, catalogue, areaRequests, phlebotomists, recent, lifetime,
    ] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: inRange, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: live, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { ...live, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, _sum: { total: true } }),
      this.prisma.order.aggregate({ where: { ...live, paymentStatus: 'PENDING' }, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: inRange, _sum: { refundedPaise: true } }),
      this.prisma.order.groupBy({ by: ['userId'], where: live }),
      this.prisma.order.groupBy({ by: ['collectionType'], where: live, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.orderItem.groupBy({ by: ['itemName'], where: { order: live }, _count: { _all: true }, _sum: { price: true }, orderBy: { _count: { itemName: 'desc' } }, take: 8 }),
      this.prisma.$queryRaw<{ hours: number | null; n: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(r."approvedAt", r."createdAt") - o."collectedAt")) / 3600)::float AS hours, COUNT(*) AS n
        FROM "reports" r JOIN "orders" o ON o."id" = r."orderId"
        WHERE o."labId" = ${labId} AND o."collectedAt" IS NOT NULL AND r."status" <> 'PENDING'
          AND COALESCE(r."approvedAt", r."createdAt") > o."collectedAt"
          ${from ? Prisma.sql`AND o."createdAt" >= ${from}` : Prisma.empty}`,
      this.prisma.$queryRaw<{ bucket: Date; bookings: bigint; revenue: bigint | null }[]>`
        SELECT date_trunc(${monthly ? 'month' : 'day'}, o."createdAt" + interval '5 hours 30 minutes') AS bucket,
               COUNT(*) AS bookings, SUM(o."total") AS revenue
        FROM "orders" o
        WHERE o."labId" = ${labId} AND o."status" <> 'CANCELLED'
          ${from ? Prisma.sql`AND o."createdAt" >= ${from}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ avg: number | null; n: bigint }[]>`
        SELECT AVG(pr."rating")::float AS avg, COUNT(*) AS n
        FROM "phlebotomist_ratings" pr JOIN "orders" o ON o."id" = pr."orderId"
        WHERE o."labId" = ${labId} ${from ? Prisma.sql`AND pr."createdAt" >= ${from}` : Prisma.empty}`,
      this.prisma.order.count({ where: { labId, status: { not: 'CANCELLED' }, scheduledDate: { gte: today, lt: tomorrow } } }),
      this.prisma.order.count({ where: { labId, status: { in: [...OPEN_FOR_COLLECTION] } } }),
      this.prisma.order.count({ where: { labId, status: { in: [...IN_PROCESS] } } }),
      this.prisma.report.count({ where: { status: { in: ['PENDING', 'UPLOADED'] }, order: { labId, status: { not: 'CANCELLED' } } } }),
      this.prisma.labCatalogueItem.groupBy({ by: ['itemType'], where: { labId }, _count: { _all: true } }),
      this.prisma.labServiceAreaRequest.count({ where: { labId, status: 'PENDING' } }),
      this.prisma.phlebotomist.findMany({
        where: { labId },
        select: { id: true, status: true, rating: true, user: { select: { name: true, phone: true } }, _count: { select: { orders: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: { labId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, total: true, collectionType: true, createdAt: true, scheduledDate: true, user: { select: { name: true } } },
      }),
      this.prisma.order.aggregate({ where: { labId, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: { _all: true } }),
    ]);

    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const totalBookings = byStatus.reduce((a, b) => a + b._count._all, 0);
    const liveCount = booked._count._all;
    const bookedRevenue = booked._sum.total ?? 0;

    // Every day / month of the period, including empty ones, so the trend has no gaps.
    const buckets: { date: string; bookings: number; revenue: number }[] = [];
    const seriesMap = new Map(series.map((s) => [s.bucket.toISOString().slice(0, monthly ? 7 : 10), s]));
    if (monthly) {
      // Buckets are IST calendar months (the SQL shifted to IST before truncating).
      const firstIst = from ? new Date(from.getTime() + IST_MS) : (series[0]?.bucket ?? new Date(today.getTime() + IST_MS));
      const start = new Date(Date.UTC(firstIst.getUTCFullYear(), firstIst.getUTCMonth(), 1));
      const end = new Date(today.getTime() + IST_MS);
      for (let d = start; d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
        const key = d.toISOString().slice(0, 7);
        const s = seriesMap.get(key);
        buckets.push({ date: key, bookings: Number(s?.bookings ?? 0), revenue: Number(s?.revenue ?? 0) });
      }
    } else {
      for (let i = DAYS[range as Exclude<LabDashboardRange, 'all'>] - 1; i >= 0; i--) {
        const key = new Date(today.getTime() + IST_MS - i * 86400_000).toISOString().slice(0, 10);
        const s = seriesMap.get(key);
        buckets.push({ date: key, bookings: Number(s?.bookings ?? 0), revenue: Number(s?.revenue ?? 0) });
      }
    }

    return {
      lab,
      range,
      from,
      kpis: {
        bookings: totalBookings,
        activeBookings: liveCount,
        completed: count('REPORT_READY'),
        cancelled: count('CANCELLED'),
        cancellationRate: totalBookings ? Math.round((count('CANCELLED') / totalBookings) * 1000) / 10 : 0,
        bookedRevenue,
        paidRevenue: paid._sum.total ?? 0,
        pendingRevenue: pending._sum.total ?? 0,
        pendingBookings: pending._count._all,
        refunded: Math.round((refunded._sum.refundedPaise ?? 0) / 100),
        averageOrderValue: liveCount ? Math.round(bookedRevenue / liveCount) : 0,
        patients: patients.length,
        reportTurnaroundHours: tat[0]?.hours != null ? Math.round(tat[0].hours * 10) / 10 : null,
        reportsTimed: Number(tat[0]?.n ?? 0),
        phlebotomistRating: ratings[0]?.avg != null ? Math.round(ratings[0].avg * 10) / 10 : null,
        ratingsCount: Number(ratings[0]?.n ?? 0),
      },
      lifetime: { bookings: lifetime._count._all, revenue: lifetime._sum.total ?? 0 },
      series: { granularity: monthly ? 'month' : 'day', points: buckets },
      statusBreakdown: byStatus.map((b) => ({ status: b.status, count: b._count._all })).sort((a, b) => b.count - a.count),
      collectionSplit: byType.map((t) => ({ type: t.collectionType, bookings: t._count._all, revenue: t._sum.total ?? 0 })),
      topTests: top.map((t) => ({ name: t.itemName, bookings: t._count._all, revenue: t._sum.price ?? 0 })),
      operations: { scheduledToday: todayCount, awaitingCollection, inProcess, reportsPending },
      coverage: {
        pincodes: lab.servicePincodes,
        pendingAreaRequests: areaRequests,
        catalogue: Object.fromEntries(catalogue.map((c) => [c.itemType, c._count._all])) as Partial<Record<'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY', number>>,
      },
      phlebotomists: phlebotomists.map((ph) => ({ id: ph.id, name: ph.user.name, phone: ph.user.phone, status: ph.status, rating: ph.rating, bookings: ph._count.orders })),
      recentBookings: recent.map((o) => ({ ...o, patientName: o.user.name, user: undefined })),
    };
  }
}
