import { Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beforeFilter, pageSize, toFeedItem } from './notifications.service.js';

// The customer app's in-app notification feed — every notification NotificationsService.notifyUser()
// ever wrote for this user, independent of whether the Firebase push actually reached a device
// (see that service's own comment). Read-only list + read/unread state; sending is never
// triggered from here — see notifyUser() for the one write path.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  // Each item: id, title, body, kind, type, status, the ids (orderId / prescriptionId / homeVisitId / …), data (the
  // push payload, same keys), read, readAt, createdAt.
  // Newest first. Pages: ?limit= (1–100, default 100) and ?before=<createdAt of the last item you have>.
  @Get()
  async list(@Req() req: any, @Query('limit') limit?: string, @Query('before') before?: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: req.user.sub, app: 'CUSTOMER', ...beforeFilter(before) },
      orderBy: { createdAt: 'desc' },
      take: pageSize(limit),
    });
    return rows.map(toFeedItem);
  }

  @Post(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    const r = await this.prisma.notification.updateMany({
      where: { id, userId: req.user.sub, app: 'CUSTOMER' },
      data: { readAt: new Date() },
    });
    // Someone else's id looks exactly like one that doesn't exist.
    if (r.count === 0) throw new NotFoundException('Notification not found');
    return { ok: true };
  }

  @Post('read-all')
  async markAllRead(@Req() req: any) {
    await this.prisma.notification.updateMany({
      where: { userId: req.user.sub, app: 'CUSTOMER', readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
