import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
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
    private readonly catalogue: CatalogueService,
  ) {}

  /**
   * The same detail the customer app shows for a test / package (what it covers, parameters with reference
   * ranges, sample type, fasting and preparation notes), looked up by catalogue id. Returns null when the item
   * has since been switched off — the caller still has the order line's own name and price to show.
   */
  private async itemDetails(itemType: string, itemId: string, city?: string | null) {
    const type = itemType.toUpperCase();
    const row =
      type === 'PACKAGE'
        ? await this.prisma.package.findUnique({ where: { id: itemId }, select: { slug: true } })
        : type === 'PROFILE'
          ? await this.prisma.profile.findUnique({ where: { id: itemId }, select: { slug: true } })
          : type === 'PARAMETER'
            ? await this.prisma.parameter.findUnique({ where: { id: itemId }, select: { slug: true } })
            : null;
    if (!row) return null;
    try {
      return await this.catalogue.getItemDetail(row.slug, { type: type === 'PACKAGE' ? 'package' : 'test', cityId: city ?? undefined });
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  // One test/package line of a booking assigned to this phlebotomist, with its full catalogue detail.
  @Get('orders/:orderId/items/:orderItemId/details')
  async orderItemDetails(@Req() req: any, @Param('orderId') orderId: string, @Param('orderItemId') orderItemId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { phlebotomistId: true, address: { select: { city: true } } },
    });
    if (!order || order.phlebotomistId !== req.phlebotomist.phlebotomistId) throw new NotFoundException('Booking not found');
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      include: { sample: true, familyMember: { select: { name: true, relation: true } } },
    });
    if (!item) throw new NotFoundException('Test not found in this booking');
    return {
      orderItem: {
        id: item.id,
        itemType: item.itemType,
        itemId: item.itemId,
        itemName: item.itemName,
        mrp: item.mrp,
        price: item.price,
        addedAtDoor: Boolean(item.addOnId),
        patient: item.familyMember,
        sample: item.sample,
      },
      details: await this.itemDetails(item.itemType, item.itemId, order.address?.city),
    };
  }

  // Detail for any catalogue test/package — e.g. to preview one before asking the patient to add it.
  @Get('items/:itemType/:itemId/details')
  async catalogueItemDetails(@Param('itemType') itemType: string, @Param('itemId') itemId: string, @Query('cityId') cityId?: string) {
    if (!['PARAMETER', 'PROFILE', 'PACKAGE'].includes(itemType.toUpperCase())) {
      throw new BadRequestException('itemType must be PARAMETER, PROFILE or PACKAGE');
    }
    const details = await this.itemDetails(itemType, itemId, cityId);
    if (!details) throw new NotFoundException('Item not found');
    return details;
  }

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
