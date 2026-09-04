import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayIstDateString } from '../common/ist-time.js';

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
