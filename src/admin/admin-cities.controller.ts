import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify } from '../common/slugify.js';
import { CreateCityDto, UpdateCityDto } from './dto/upsert-city.dto.js';

@Controller('admin/cities')
@UseGuards(AdminAuthGuard)
export class AdminCitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateCityDto) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    const existing = await this.prisma.city.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('A city with this slug already exists');
    return this.prisma.city.create({ data: { name: dto.name, slug, isActive: dto.isActive ?? true } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('City not found');

    if (dto.slug && dto.slug !== existing.slug) {
      const clash = await this.prisma.city.findUnique({ where: { slug: dto.slug } });
      if (clash) throw new ConflictException('A city with this slug already exists');
    }

    return this.prisma.city.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // Delete only when genuinely unused — City is referenced by CollectionCenter.cityId (no
  // cascade), so deleting a used city would leave a dangling reference. Deactivate instead.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const centerCount = await this.prisma.collectionCenter.count({ where: { cityId: id } });
    if (centerCount > 0) {
      throw new BadRequestException(
        `Cannot delete — ${centerCount} collection center(s) still use this city. Deactivate it instead, or reassign them first.`,
      );
    }
    await this.prisma.city.delete({ where: { id } });
    return { deleted: true };
  }
}
