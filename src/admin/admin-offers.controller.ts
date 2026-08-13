import { randomUUID } from 'crypto';
import { extname, join } from 'path';
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
import { UpdateOfferDto, UpsertOfferDto } from './dto/upsert-offer.dto.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'offers'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('admin/offers')
@UseGuards(AdminAuthGuard)
export class AdminOffersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.offer.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(@Body() dto: UpsertOfferDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Offer image is required');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException('Image must be JPEG, PNG or WebP');

    return this.prisma.offer.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        ctaLabel: dto.ctaLabel || 'Book Now',
        ctaLink: dto.ctaLink,
        sortOrder: dto.sortOrder ? Number(dto.sortOrder) : 0,
        status: dto.status ?? 'ACTIVE',
        imageUrl: `/uploads/offers/${file.filename}`,
      },
    });
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async update(@Param('id') id: string, @Body() dto: UpdateOfferDto, @UploadedFile() file?: Express.Multer.File) {
    const existing = await this.prisma.offer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Offer not found');

    if (file && !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG or WebP');
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.ctaLabel !== undefined ? { ctaLabel: dto.ctaLabel } : {}),
        ...(dto.ctaLink !== undefined ? { ctaLink: dto.ctaLink } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: Number(dto.sortOrder) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(file ? { imageUrl: `/uploads/offers/${file.filename}` } : {}),
      },
    });

    if (file && existing.imageUrl) {
      const oldPath = join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
      await unlink(oldPath).catch(() => {});
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.offer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Offer not found');

    await this.prisma.offer.delete({ where: { id } });

    if (existing.imageUrl) {
      const oldPath = join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
      await unlink(oldPath).catch(() => {});
    }

    return { ok: true };
  }
}
