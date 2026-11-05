import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayIstDateString } from '../common/ist-time.js';
import { bucketOf, parseDashboardRange, trendBuckets } from './dashboard-range.js';

const REPORT_RECENT_ORDERS = 10;

const REVENUE_TREND_DAYS = 7;

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard)
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /** Cheap poll target for the topbar notification bell — every admin page renders that bell,
   *  so it stays a tiny two-count query instead of the full summary(). */
  @Get('alerts')
  async alerts() {
    const [pendingAssignment, pendingReportsApproval] = await Promise.all([
      this.prisma.order.count({ where: { status: 'CONFIRMED', phlebotomistId: null } }),
      this.prisma.report.count({ where: { status: 'UPLOADED' } }),
    ]);
    return { pendingAssignment, pendingReportsApproval };
  }

  /**
   * The dashboard's report for one period — a day, a week, a month or any custom range of IST dates (from/to, both
   * inclusive, at most a year). Bookings are counted by the day they were made; revenue is what was paid on bookings
   * made in the period (as in summary()); reports by the day they were released to the patient.
   */
  @Get('report')
  async report(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDashboardRange(from, to);
    const inPeriod = { createdAt: { gte: range.start, lt: range.end } };

    const [bookings, cancelled, revenue, newPatients, reportsReleased, statusCounts, paymentMethodCounts, collectionTypeCounts, recentOrders, trendOrders] =
      await Promise.all([
        this.prisma.order.count({ where: inPeriod }),
        this.prisma.order.count({ where: { ...inPeriod, status: 'CANCELLED' } }),
        this.prisma.order.aggregate({ where: { ...inPeriod, paymentStatus: 'PAID' }, _sum: { total: true }, _count: true }),
        this.prisma.user.count({ where: { role: 'PATIENT', ...inPeriod } }),
        this.prisma.report.count({ where: { status: 'APPROVED', approvedAt: { gte: range.start, lt: range.end } } }),
        this.prisma.order.groupBy({ by: ['status'], where: inPeriod, _count: { status: true } }),
        this.prisma.order.groupBy({ by: ['paymentMethod'], where: inPeriod, _count: { paymentMethod: true } }),
        this.prisma.order.groupBy({ by: ['collectionType'], where: inPeriod, _count: { collectionType: true } }),
        this.prisma.order.findMany({
          where: inPeriod,
          orderBy: { createdAt: 'desc' },
          take: REPORT_RECENT_ORDERS,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        }),
        this.prisma.order.findMany({ where: inPeriod, select: { total: true, createdAt: true, paymentStatus: true } }),
      ]);

    const trend = new Map(trendBuckets(range).map((key) => [key, { bookings: 0, revenue: 0 }]));
    for (const o of trendOrders) {
      const point = trend.get(bucketOf(o.createdAt, range.bucket));
      if (!point) continue;
      point.bookings++;
      if (o.paymentStatus === 'PAID') point.revenue += o.total;
    }
    const revenueTotal = revenue._sum.total ?? 0;

    return {
      from: range.from,
      to: range.to,
      days: range.days,
      bucket: range.bucket,
      bookings,
      cancelled,
      paidBookings: revenue._count,
      revenue: revenueTotal,
      averageBookingValue: revenue._count > 0 ? Math.round(revenueTotal / revenue._count) : 0,
      newPatients,
      reportsReleased,
      ordersByStatus: Object.fromEntries(statusCounts.map((x) => [x.status, x._count.status])),
      paymentMethodBreakdown: Object.fromEntries(paymentMethodCounts.map((p) => [p.paymentMethod, p._count.paymentMethod])),
      collectionTypeBreakdown: Object.fromEntries(collectionTypeCounts.map((c) => [c.collectionType, c._count.collectionType])),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        patientName: o.user.name,
        patientPhone: o.user.phone,
      })),
      trend: Array.from(trend.entries()).map(([key, v]) => ({ key, ...v })),
    };
  }

  /**
   * How each partner lab (franchise) did in a period — same period and revenue rules as report(). Bookings are those
   * routed to the lab and made in the period; revenue is what was paid on them; "due" is still to be collected on
   * bookings that are not cancelled; reports by the day they were released. Bookings not routed to any lab (centre visits,
   * older bookings) are shown as one more row so the totals add up to the dashboard's.
   */
  @Get('labs')
  async labs(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDashboardRange(from, to);
    const inPeriod = { createdAt: { gte: range.start, lt: range.end } };

    const [labs, byStatus, byPayment, visits, reports] = await Promise.all([
      this.prisma.lab.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } }),
      this.prisma.order.groupBy({ by: ['labId', 'status'], where: inPeriod, _count: { _all: true } }),
      // Paid and still-to-pay, split by cancelled or not: revenue counts every paid booking (as report() does),
      // "due" only bookings that are not cancelled.
      this.prisma.order.groupBy({
        by: ['labId', 'paymentStatus', 'status'],
        where: { ...inPeriod, paymentStatus: { in: ['PAID', 'PENDING'] } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.homeCollectionRequest.groupBy({ by: ['labId'], where: inPeriod, _count: { _all: true } }),
      this.prisma.report.findMany({
        where: { status: 'APPROVED', approvedAt: { gte: range.start, lt: range.end } },
        select: { order: { select: { labId: true } } },
      }),
    ]);

    type Row = {
      labId: string | null;
      name: string;
      status: string | null;
      bookings: number;
      completed: number;
      cancelled: number;
      paidBookings: number;
      revenue: number;
      due: number;
      averageBookingValue: number;
      homeVisits: number;
      reportsReleased: number;
    };
    const rows = new Map<string | null, Row>();
    const row = (labId: string | null): Row => {
      let r = rows.get(labId);
      if (!r) {
        const lab = labs.find((l) => l.id === labId);
        r = {
          labId,
          name: lab?.name ?? (labId ? 'Removed lab' : 'Not routed to a lab'),
          status: lab?.status ?? null,
          bookings: 0,
          completed: 0,
          cancelled: 0,
          paidBookings: 0,
          revenue: 0,
          due: 0,
          averageBookingValue: 0,
          homeVisits: 0,
          reportsReleased: 0,
        };
        rows.set(labId, r);
      }
      return r;
    };
    for (const lab of labs) row(lab.id);
    for (const g of byStatus) {
      const r = row(g.labId);
      r.bookings += g._count._all;
      if (g.status === 'REPORT_READY') r.completed += g._count._all;
      if (g.status === 'CANCELLED') r.cancelled += g._count._all;
    }
    for (const g of byPayment) {
      const r = row(g.labId);
      if (g.paymentStatus === 'PAID') {
        r.revenue += g._sum.total ?? 0;
        r.paidBookings += g._count._all;
      } else if (g.status !== 'CANCELLED') {
        r.due += g._sum.total ?? 0;
      }
    }
    for (const g of visits) row(g.labId).homeVisits += g._count._all;
    for (const rep of reports) row(rep.order.labId).reportsReleased++;
    for (const r of rows.values()) r.averageBookingValue = r.paidBookings > 0 ? Math.round(r.revenue / r.paidBookings) : 0;

    // Labs first (busiest first), the unrouted row last — and only when it has anything in it.
    const list = [...rows.values()]
      .filter((r) => r.labId !== null || r.bookings + r.homeVisits + r.reportsReleased > 0)
      .sort((a, b) => (a.labId === null ? 1 : b.labId === null ? -1 : b.revenue - a.revenue || b.bookings - a.bookings || a.name.localeCompare(b.name)));
    return { from: range.from, to: range.to, labs: list };
  }

  @Get('summary')
  async summary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const startOfTrendWindow = new Date(startOfToday);
    startOfTrendWindow.setDate(startOfTrendWindow.getDate() - (REVENUE_TREND_DAYS - 1));

    const [
      totalPatients,
      newPatientsThisWeek,
      totalOrders,
      todaysBookings,
      pendingAssignment,
      pendingReportsApproval,
      revenuePaid,
      revenueThisMonth,
      statusCounts,
      paymentMethodCounts,
      collectionTypeCounts,
      recentOrders,
      trendOrders,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PATIENT' } }),
      this.prisma.user.count({ where: { role: 'PATIENT', createdAt: { gte: startOfWeek } } }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { scheduledDate: { gte: startOfToday, lt: endOfToday }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.order.count({ where: { status: 'CONFIRMED', phlebotomistId: null } }),
      this.prisma.report.count({ where: { status: 'UPLOADED' } }),
      this.prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
      this.prisma.order.aggregate({
        where: { paymentStatus: 'PAID', createdAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
      this.prisma.order.groupBy({ by: ['paymentMethod'], _count: { paymentMethod: true } }),
      this.prisma.order.groupBy({ by: ['collectionType'], _count: { collectionType: true } }),
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          paymentMethod: true,
          createdAt: true,
          user: { select: { name: true, phone: true } },
        },
      }),
      // Booking-date based, not payment-timestamp based — there is no separate `paidAt` column,
      // so this is a reasonable proxy for "revenue trend" rather than an exact settlement ledger.
      this.prisma.order.findMany({
        where: { paymentStatus: 'PAID', createdAt: { gte: startOfTrendWindow } },
        select: { total: true, createdAt: true },
      }),
    ]);

    const revenueByDay = new Map<string, number>();
    for (let i = 0; i < REVENUE_TREND_DAYS; i++) {
      const d = new Date(startOfTrendWindow);
      d.setDate(d.getDate() + i);
      revenueByDay.set(todayIstDateString(d), 0);
    }
    for (const o of trendOrders) {
      const key = todayIstDateString(o.createdAt);
      if (revenueByDay.has(key)) revenueByDay.set(key, revenueByDay.get(key)! + o.total);
    }

    return {
      totalPatients,
      newPatientsThisWeek,
      totalOrders,
      todaysBookings,
      pendingAssignment,
      pendingReportsApproval,
      revenueCollected: revenuePaid._sum.total ?? 0,
      revenueThisMonth: revenueThisMonth._sum.total ?? 0,
      ordersByStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count.status])),
      paymentMethodBreakdown: Object.fromEntries(paymentMethodCounts.map((p) => [p.paymentMethod, p._count.paymentMethod])),
      collectionTypeBreakdown: Object.fromEntries(collectionTypeCounts.map((c) => [c.collectionType, c._count.collectionType])),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        patientName: o.user.name,
        patientPhone: o.user.phone,
      })),
      revenueTrend: Array.from(revenueByDay.entries()).map(([date, amount]) => ({ date, amount })),
    };
  }
}
