import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { unlink } from 'fs/promises';
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
import { UpdateBlogPostDto, UpsertBlogPostDto } from './dto/upsert-blog-post.dto.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'blog'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('admin/blog')
@UseGuards(AdminAuthGuard)
export class AdminBlogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(@Body() dto: UpsertBlogPostDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Cover image is required');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException('Image must be JPEG, PNG or WebP');

    const slug = dto.slug?.trim() || slugify(dto.title);
    if (!slug) throw new BadRequestException('Could not derive a slug from this title — provide one explicitly');
    const existing = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('A post with this slug already exists');

    const status = dto.status ?? 'DRAFT';
    return this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        category: dto.category,
        excerpt: dto.excerpt,
        content: dto.content,
        readTimeMinutes: dto.readTimeMinutes ? Number(dto.readTimeMinutes) : 5,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        coverImageUrl: `/uploads/blog/${file.filename}`,
      },
    });
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto, @UploadedFile() file?: Express.Multer.File) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    if (file && !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Image must be JPEG, PNG or WebP');
    }

    if (dto.slug && dto.slug !== existing.slug) {
      const clash = await this.prisma.blogPost.findUnique({ where: { slug: dto.slug } });
      if (clash) throw new ConflictException('A post with this slug already exists');
    }

    const becomingPublished = dto.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.readTimeMinutes !== undefined ? { readTimeMinutes: Number(dto.readTimeMinutes) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(becomingPublished ? { publishedAt: new Date() } : {}),
        ...(file ? { coverImageUrl: `/uploads/blog/${file.filename}` } : {}),
      },
    });

    if (file && existing.coverImageUrl) {
      const oldPath = join(process.cwd(), existing.coverImageUrl.replace(/^\//, ''));
      await unlink(oldPath).catch(() => {});
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    await this.prisma.blogPost.delete({ where: { id } });

    if (existing.coverImageUrl) {
      const oldPath = join(process.cwd(), existing.coverImageUrl.replace(/^\//, ''));
      await unlink(oldPath).catch(() => {});
    }

    return { ok: true };
  }
}
