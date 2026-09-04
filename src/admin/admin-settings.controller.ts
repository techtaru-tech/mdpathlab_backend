import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { BadRequestException, Body, Controller, Get, Patch, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_FAVICON_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'settings');
// multer's diskStorage never creates its destination — unlike the other upload dirs (offers,
// blog, reports) which happened to survive by never being emptied, this one really did get
// deleted by cleanup once, silently 500ing every upload until recreated by hand.
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

type UploadedFileSet = { logo?: Express.Multer.File[]; favicon?: Express.Multer.File[]; banner?: Express.Multer.File[] };

@Controller('admin/settings')
@UseGuards(AdminAuthGuard)
export class AdminSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  get() {
    return this.settings.getOrCreate();
  }

  @Patch()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 },
        { name: 'banner', maxCount: 1 },
      ],
      { storage, limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async update(@Body() dto: UpdateSiteSettingsDto, @UploadedFiles() files: UploadedFileSet) {
    const existing = await this.settings.getOrCreate();

    const logo = files?.logo?.[0];
    const favicon = files?.favicon?.[0];
    const banner = files?.banner?.[0];

    if (logo && !ALLOWED_IMAGE_TYPES.has(logo.mimetype)) throw new BadRequestException('Logo must be JPEG, PNG or WebP');
    if (banner && !ALLOWED_IMAGE_TYPES.has(banner.mimetype)) throw new BadRequestException('Banner must be JPEG, PNG or WebP');
    if (favicon && !ALLOWED_FAVICON_TYPES.has(favicon.mimetype)) {
      throw new BadRequestException('Favicon must be JPEG, PNG, WebP or ICO');
    }

    const updated = await this.prisma.siteSetting.update({
      where: { id: existing.id },
      data: {
        // Plain optional fields — blank clears to null, matches the rest of this codebase.
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.appStoreUrl !== undefined ? { appStoreUrl: dto.appStoreUrl || null } : {}),
        ...(dto.playStoreUrl !== undefined ? { playStoreUrl: dto.playStoreUrl || null } : {}),
        ...(dto.privacyPolicyContent !== undefined ? { privacyPolicyContent: dto.privacyPolicyContent || null } : {}),
        ...(dto.termsConditionsContent !== undefined ? { termsConditionsContent: dto.termsConditionsContent || null } : {}),
        // Secrets: a blank/omitted value NEVER clears an already-configured key — an admin
        // re-saving the address tab, say, must not accidentally wipe live Razorpay credentials.
        ...(dto.razorpayKeyId ? { razorpayKeyId: dto.razorpayKeyId } : {}),
        ...(dto.razorpayKeySecret ? { razorpayKeySecret: dto.razorpayKeySecret } : {}),
        ...(dto.razorpayWebhookSecret ? { razorpayWebhookSecret: dto.razorpayWebhookSecret } : {}),
        ...(dto.onlinePaymentEnabled !== undefined ? { onlinePaymentEnabled: dto.onlinePaymentEnabled === 'true' } : {}),
        ...(dto.codEnabled !== undefined ? { codEnabled: dto.codEnabled === 'true' } : {}),
        ...(logo ? { logoUrl: `/uploads/settings/${logo.filename}` } : {}),
        ...(favicon ? { faviconUrl: `/uploads/settings/${favicon.filename}` } : {}),
        ...(banner ? { bannerUrl: `/uploads/settings/${banner.filename}` } : {}),
      },
    });

    await Promise.all(
      [
        [logo, existing.logoUrl],
        [favicon, existing.faviconUrl],
        [banner, existing.bannerUrl],
      ]
        .filter(([file, oldUrl]) => file && oldUrl)
        .map(([, oldUrl]) => unlink(join(process.cwd(), (oldUrl as string).replace(/^\//, ''))).catch(() => {})),
    );

    return updated;
  }
}
