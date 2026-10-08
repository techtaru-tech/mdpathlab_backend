import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

// Phlebotomist app: static pages (About / Privacy / Terms), Help & Support, and the in-app
// notification feed. Page text and contact details are the same admin-managed SiteSetting the
// customer app and website read; FAQs are the same admin-managed list as /support/faq.
@Controller('phlebotomist')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Get('pages')
  async pages() {
    const s = await this.settings.getOrCreate();
    return {
      aboutUs: s.aboutUsContent ?? '',
      privacyPolicy: s.privacyPolicyContent ?? '',
      termsConditions: s.termsConditionsContent ?? '',
    };
  }

  @Get('help-support')
  async helpSupport() {
    const [s, faqs] = await Promise.all([
      this.settings.getOrCreate(),
      this.prisma.faq.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }] }),
    ]);
    return {
      contact: { phone: s.phone, email: s.email, address: s.address },
      faqs: faqs.map((f) => ({ id: f.id, topic: f.topic, question: f.question, answer: f.answer })),
    };
  }

  // The phlebotomist's Notification rows are keyed by the same `sub` their push device tokens use.
  @Get('notifications')
  async notifications(@Req() req: any, @Query('unread') unread?: string) {
    const userId = req.phlebotomist.sub;
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(unread === 'true' ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unreadCount, items };
  }

  @Post('notifications/read-all')
  async markAllRead(@Req() req: any) {
    await this.prisma.notification.updateMany({
      where: { userId: req.phlebotomist.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post('notifications/:id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: req.phlebotomist.sub },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
