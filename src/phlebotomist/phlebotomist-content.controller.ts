import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UpdatePhlebotomistProfileDto } from './dto/update-profile.dto.js';
import { phlebotomistStats } from './phlebotomist-stats.js';

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_DIR = join(process.cwd(), 'uploads', 'phlebotomist-photos');
mkdirSync(PHOTO_DIR, { recursive: true });
const photoStorage = diskStorage({
  destination: PHOTO_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

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

  // JSON or multipart/form-data. Send the picture as the `photo` file field (JPEG/PNG/WebP, up to 5 MB);
  // `removePhoto=true` deletes the current one. Every other field is optional and unchanged if omitted.
  @Patch('profile')
  @UseInterceptors(FileInterceptor('photo', { storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async updateProfile(@Req() req: any, @Body() dto: UpdatePhlebotomistProfileDto, @UploadedFile() photo?: Express.Multer.File) {
    const { vehicleType, vehicleNumber, dob, removePhoto, ...userFields } = dto;
    const id = req.phlebotomist.phlebotomistId;

    if (photo && !PHOTO_TYPES.has(photo.mimetype)) {
      await unlink(photo.path).catch(() => undefined);
      throw new BadRequestException('Photo must be a JPEG, PNG or WebP image');
    }
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id }, select: { id: true, photoUrl: true } });
    if (!existing) {
      if (photo) await unlink(photo.path).catch(() => undefined);
      throw new NotFoundException('Profile not found');
    }

    const photoUrl = photo ? `/uploads/phlebotomist-photos/${photo.filename}` : removePhoto === 'true' ? null : undefined;
    await this.prisma.phlebotomist.update({
      where: { id },
      data: {
        ...(vehicleType !== undefined ? { vehicleType } : {}),
        ...(vehicleNumber !== undefined ? { vehicleNumber } : {}),
        ...(photoUrl !== undefined ? { photoUrl } : {}),
        user: { update: { ...userFields, ...(dob !== undefined ? { dob: new Date(dob) } : {}) } },
      },
    });
    // The replaced/removed picture is no longer referenced anywhere — delete it from disk.
    if (photoUrl !== undefined && existing.photoUrl) {
      await unlink(join(process.cwd(), existing.photoUrl)).catch(() => undefined);
    }
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
