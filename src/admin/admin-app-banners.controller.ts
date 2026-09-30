import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAppBannerDto, UpdateAppBannerDto } from './dto/app-banner.dto.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'app-banners');
// multer's diskStorage never creates its destination.
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

// Home-screen banner carousel for the customer mobile app — each banner is one finished design
// image (all copy baked into the picture), so there is no title/subtitle/link to manage. Kept apart
// from /admin/offers, which are the website's promo banners.
@Controller('admin/app-banners')
@UseGuards(AdminAuthGuard)
export class AdminAppBannersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.appBanner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(@Body() dto: CreateAppBannerDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Banner image is required');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Image must be JPEG, PNG or WebP');
    }
    return this.prisma.appBanner.create({
      data: {
        imageUrl: `/uploads/app-banners/${file.filename}`,
        sortOrder: dto.sortOrder ? Number(dto.sortOrder) : 0,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAppBannerDto) {
    const existing = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    return this.prisma.appBanner.update({
      where: { id },
      data: {
        ...(dto.sortOrder !== undefined ? { sortOrder: Number(dto.sortOrder) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    await this.prisma.appBanner.delete({ where: { id } });
    await unlink(join(process.cwd(), existing.imageUrl.replace(/^\//, ''))).catch(() => undefined);
    return { ok: true };
  }
}
