import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UpdatePhlebotomistProfileDto } from './dto/update-profile.dto.js';
import { phlebotomistStats } from './phlebotomist-stats.js';

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

  @Get('profile')
  profile(@Req() req: any) {
    return this.loadProfile(req.phlebotomist.phlebotomistId);
  }

  @Patch('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdatePhlebotomistProfileDto) {
    const { vehicleType, vehicleNumber, dob, ...userFields } = dto;
    const id = req.phlebotomist.phlebotomistId;
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Profile not found');
    await this.prisma.phlebotomist.update({
      where: { id },
      data: {
        ...(vehicleType !== undefined ? { vehicleType } : {}),
        ...(vehicleNumber !== undefined ? { vehicleNumber } : {}),
        user: { update: { ...userFields, ...(dob !== undefined ? { dob: new Date(dob) } : {}) } },
      },
    });
    return this.loadProfile(id);
  }

  // The customers' approved reviews on bookings this phlebotomist handled, newest first.
  @Get('reviews')
  async reviews(@Req() req: any) {
    const id = req.phlebotomist.phlebotomistId;
    const [stats, rows] = await Promise.all([
      phlebotomistStats(this.prisma, id),
      this.prisma.review.findMany({
        where: { status: 'APPROVED', order: { phlebotomistId: id } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, rating: true, comment: true, createdAt: true, order: { select: { orderNumber: true } }, user: { select: { name: true } } },
      }),
    ]);
    return {
      rating: stats.rating,
      ratingCount: stats.ratingCount,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        orderNumber: r.order.orderNumber,
        customerName: r.user.name?.split(' ')[0] ?? 'Customer',
      })),
    };
  }

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

  private async loadProfile(phlebotomistId: string) {
    const p = await this.prisma.phlebotomist.findUnique({
      where: { id: phlebotomistId },
      include: { user: { select: { name: true, phone: true, email: true, gender: true, dob: true, city: true } } },
    });
    if (!p) throw new NotFoundException('Profile not found');
    return { phlebotomist: { ...p, ...(await phlebotomistStats(this.prisma, p.id)) } };
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
