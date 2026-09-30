import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { readFile, unlink } from 'fs/promises';
import {
  BadRequestException,
  Body,
  ConflictException,
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
import { slugify } from '../common/slugify.js';
import { UpsertCategoryDto } from './dto/upsert-category.dto.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const UPLOAD_PREFIX = '/uploads/categories/';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'categories'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

// SVGs are served from the API's own origin, so anything that can run script is refused.
const UNSAFE_SVG = /<script|\son\w+\s*=|<foreignObject|javascript:/i;

@Controller('admin/categories')
@UseGuards(AdminAuthGuard)
export class AdminCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@Body() dto: UpsertCategoryDto) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('A category with this slug already exists');
    return this.prisma.category.create({ data: { name: dto.name, slug, status: dto.status, description: dto.description, imageUrl: dto.imageUrl } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertCategoryDto) {
    if (dto.slug) {
      const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) throw new ConflictException('A category with this slug already exists');
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        ...(dto.slug ? { slug: dto.slug } : {}),
        status: dto.status,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      },
    });
  }

  // Icon shown for this category in the customer app's Home screen. Replaces any previous upload.
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadImage(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');
    const discard = () => unlink(file.path).catch(() => undefined);

    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      await discard();
      throw new NotFoundException('Category not found');
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      await discard();
      throw new BadRequestException('Image must be SVG, PNG, JPEG or WebP');
    }
    if (file.mimetype === 'image/svg+xml' && UNSAFE_SVG.test(await readFile(file.path, 'utf8'))) {
      await discard();
      throw new BadRequestException('SVG must not contain scripts or event handlers');
    }

    const updated = await this.prisma.category.update({ where: { id }, data: { imageUrl: `${UPLOAD_PREFIX}${file.filename}` } });
    if (category.imageUrl?.startsWith(UPLOAD_PREFIX)) {
      await unlink(join(process.cwd(), 'uploads', 'categories', category.imageUrl.slice(UPLOAD_PREFIX.length))).catch(() => undefined);
    }
    return updated;
  }

  // Delete only when genuinely unused — Category is referenced by Parameter.categoryId and
  // Profile.categoryId (both nullable, no cascade), so deleting a used category would leave
  // dangling references. Deactivate instead when in use.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [parameterCount, profileCount] = await Promise.all([
      this.prisma.parameter.count({ where: { categoryId: id } }),
      this.prisma.profile.count({ where: { categoryId: id } }),
    ]);
    if (parameterCount > 0 || profileCount > 0) {
      throw new BadRequestException(
        `Cannot delete — ${parameterCount} parameter(s) and ${profileCount} test(s) still use this category. Deactivate it instead, or reassign them first.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }
}
