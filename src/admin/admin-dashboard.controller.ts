import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard)
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [totalPatients, todaysBookings, pendingAssignment, revenuePaid, statusCounts] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PATIENT' } }),
      this.prisma.order.count({
        where: { scheduledDate: { gte: startOfToday, lt: endOfToday }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.order.count({ where: { status: 'CONFIRMED', phlebotomistId: null } }),
      this.prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    return {
      totalPatients,
      todaysBookings,
      pendingAssignment,
      revenueCollected: revenuePaid._sum.total ?? 0,
      ordersByStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count.status])),
    };
  }
}
