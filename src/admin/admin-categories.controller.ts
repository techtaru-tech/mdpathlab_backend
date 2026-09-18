import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify } from '../common/slugify.js';
import { UpsertCategoryDto } from './dto/upsert-category.dto.js';

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
    return this.prisma.category.create({ data: { name: dto.name, slug, status: dto.status, description: dto.description } });
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
      },
    });
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
