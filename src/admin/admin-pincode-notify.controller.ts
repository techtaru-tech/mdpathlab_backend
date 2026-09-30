import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Read-only — status flips PENDING -> NOTIFIED automatically once a Lab is added/edited to
// cover that pincode (see PincodeNotifyService.notifyPendingForPincode), so there's no manual
// "mark as done" action here, unlike ContactQuery/CallbackRequest.
@Controller('admin/pincode-notify-requests')
@UseGuards(AdminAuthGuard)
export class AdminPincodeNotifyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.prisma.pincodeNotifyRequest.findMany({
      where: status === 'PENDING' || status === 'NOTIFIED' ? { status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  // Demand per pincode — where customers are asking for service, busiest first, with whether any
  // active lab already covers it (so an admin can see which uncovered pincodes are worth opening).
  @Get('demand')
  async demand() {
    const [groups, labs] = await Promise.all([
      this.prisma.pincodeNotifyRequest.groupBy({
        by: ['pincode', 'status'],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.lab.findMany({ where: { status: 'ACTIVE' }, select: { servicePincodes: true } }),
    ]);
    const covered = new Set(labs.flatMap((l) => l.servicePincodes));

    const byPincode = new Map<string, { pincode: string; total: number; pending: number; lastRequestedAt: Date | null }>();
    for (const g of groups) {
      const row = byPincode.get(g.pincode) ?? { pincode: g.pincode, total: 0, pending: 0, lastRequestedAt: null };
      row.total += g._count._all;
      if (g.status === 'PENDING') row.pending += g._count._all;
      if (g._max.createdAt && (!row.lastRequestedAt || g._max.createdAt > row.lastRequestedAt)) row.lastRequestedAt = g._max.createdAt;
      byPincode.set(g.pincode, row);
    }
    return [...byPincode.values()]
      .map((r) => ({ ...r, covered: covered.has(r.pincode) }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total);
  }
}
