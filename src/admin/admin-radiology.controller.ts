import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueValidationService } from './catalogue-validation.service.js';
import { slugify } from '../common/slugify.js';
import { UpsertRadiologyDto } from './dto/upsert-radiology.dto.js';

// Admin CRUD for radiology (X-Ray/CT/MRI/etc.) catalogue items — deliberately simple (list,
// create, update, status toggle, delete only, no CSV import/export or per-city pricing like
// AdminTestsController) since this is a lighter, admin-just-adds-a-few-items catalogue.
@Controller('admin/radiology')
@UseGuards(AdminAuthGuard)
export class AdminRadiologyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CatalogueValidationService,
  ) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string, @Query('categoryId') categoryId?: string) {
    return this.prisma.radiologyTest.findMany({
      where: {
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { testCode: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(status ? { status: status as never } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.radiologyTest.findUnique({ where: { id }, include: { category: true } });
    if (!row) throw new BadRequestException('Radiology test not found');
    return row;
  }

  @Post()
  async create(@Body() dto: UpsertRadiologyDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    await this.assertSlugAvailable(slug);

    const existingCode = await this.prisma.radiologyTest.findUnique({ where: { testCode: dto.testCode } });
    if (existingCode) throw new BadRequestException('This test code is already in use');

    return this.prisma.radiologyTest.create({ data: { ...dto, slug }, include: { category: true } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertRadiologyDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    if (dto.slug) await this.assertSlugAvailable(dto.slug, id);

    const existingCode = await this.prisma.radiologyTest.findUnique({ where: { testCode: dto.testCode } });
    if (existingCode && existingCode.id !== id) throw new BadRequestException('This test code is already in use');

    return this.prisma.radiologyTest.update({ where: { id }, data: dto, include: { category: true } });
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' }) {
    return this.prisma.radiologyTest.update({ where: { id }, data: { status: body.status } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [cartItems, orderItems, labCatalogueItems] = await Promise.all([
      this.prisma.cartItem.count({ where: { itemType: 'RADIOLOGY', itemId: id } }),
      this.prisma.orderItem.count({ where: { itemType: 'RADIOLOGY', itemId: id } }),
      this.prisma.labCatalogueItem.count({ where: { itemType: 'RADIOLOGY', itemId: id } }),
    ]);
    if (cartItems > 0 || orderItems > 0) {
      throw new BadRequestException(`Cannot delete — in use by ${cartItems} active cart(s) and ${orderItems} historical order(s). Deactivate instead.`);
    }
    await this.prisma.$transaction([
      this.prisma.labCatalogueItem.deleteMany({ where: { itemType: 'RADIOLOGY', itemId: id } }),
      this.prisma.cityPrice.deleteMany({ where: { itemType: 'RADIOLOGY', itemId: id } }),
      this.prisma.radiologyTest.delete({ where: { id } }),
    ]);
    return { deleted: true, labsUnlinked: labCatalogueItems };
  }

  // Same cross-table slug-uniqueness concern as Test/Package (see CatalogueValidationService)
  // — radiology has its own URL namespace (/radiology/:slug) so it only needs to check itself.
  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.radiologyTest.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) throw new BadRequestException('This slug is already in use');
  }
}
