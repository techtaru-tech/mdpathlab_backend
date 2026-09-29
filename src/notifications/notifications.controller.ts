import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

// The customer app's in-app notification feed — every notification NotificationsService.notifyUser()
// ever wrote for this user, independent of whether the Firebase push actually reached a device
// (see that service's own comment). Read-only list + read/unread state; sending is never
// triggered from here — see notifyUser() for the one write path.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.notification.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: req.user.sub },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post('read-all')
  async markAllRead(@Req() req: any) {
    await this.prisma.notification.updateMany({
      where: { userId: req.user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
