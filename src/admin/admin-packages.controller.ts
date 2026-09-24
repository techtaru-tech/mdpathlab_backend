import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify } from '../common/slugify.js';
import { CatalogueValidationService } from './catalogue-validation.service.js';
import { UpsertPackageDto } from './dto/upsert-package.dto.js';

@Controller('admin/packages')
@UseGuards(AdminAuthGuard)
export class AdminPackagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CatalogueValidationService,
  ) {}

  @Get()
  async list(@Query('search') search?: string, @Query('status') status?: string, @Query('featured') featured?: string) {
    const rows = await this.prisma.package.findMany({
      where: {
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        ...(status ? { status: status as never } : {}),
        ...(featured !== undefined ? { isFeatured: featured === 'true' } : {}),
      },
      include: { items: { include: { parameter: true, profile: true } }, category: true },
      orderBy: { updatedAt: 'desc' },
    });
    return this.withCityPrices(rows);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.package.findUnique({
      where: { id },
      include: { items: { include: { parameter: true, profile: true } }, category: true },
    });
    if (!row) throw new BadRequestException('Package not found');
    return (await this.withCityPrices([row]))[0];
  }

  @Post()
  async create(@Body() dto: UpsertPackageDto) {
    if (dto.price > dto.mrp) throw new BadRequestException('Selling price cannot be greater than MRP');
    await this.validation.assertCityPrices(dto.cityPrices);
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    const existing = await this.prisma.package.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('A package with this slug already exists');
    await this.validation.assertCategoryExists(dto.categoryId);
    await this.assertItemsExist(dto.items);

    const { items, cityPrices, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: {
          ...fields,
          slug,
          items: items?.length
            ? { create: items.map((item) => ({ itemType: item.itemType, parameterId: item.itemType === 'PARAMETER' ? item.itemId : null, profileId: item.itemType === 'PROFILE' ? item.itemId : null })) }
            : undefined,
        },
        include: { items: { include: { parameter: true, profile: true } } },
      });
      if (cityPrices !== undefined) await this.validation.syncCityPrices(tx, 'PACKAGE', pkg.id, cityPrices);
      return { ...pkg, cityPrices: cityPrices ?? [] };
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertPackageDto) {
    if (dto.price > dto.mrp) throw new BadRequestException('Selling price cannot be greater than MRP');
    await this.validation.assertCityPrices(dto.cityPrices);
    if (dto.slug) {
      const existing = await this.prisma.package.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) throw new BadRequestException('A package with this slug already exists');
    }
    await this.validation.assertCategoryExists(dto.categoryId);
    await this.assertItemsExist(dto.items);

    const { items, cityPrices, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.update({
        where: { id },
        data: {
          ...fields,
          ...(dto.slug ? { slug: dto.slug } : {}),
          items: items
            ? {
                deleteMany: {},
                create: items.map((item) => ({ itemType: item.itemType, parameterId: item.itemType === 'PARAMETER' ? item.itemId : null, profileId: item.itemType === 'PROFILE' ? item.itemId : null })),
              }
            : undefined,
        },
        include: { items: { include: { parameter: true, profile: true } }, category: true },
      });
      if (cityPrices !== undefined) await this.validation.syncCityPrices(tx, 'PACKAGE', id, cityPrices);
      const currentCityPrices = cityPrices ?? (await tx.cityPrice.findMany({ where: { itemType: 'PACKAGE', itemId: id } })).map((cp) => ({ cityId: cp.cityId, mrp: cp.mrp, price: cp.price }));
      return { ...pkg, cityPrices: currentCityPrices };
    });
  }

  // Merges each row's CityPrice overrides on — not a real Prisma relation (itemId is polymorphic
  // across Parameter/Profile/Package), so this is a second query rather than an `include`.
  private async withCityPrices<T extends { id: string }>(rows: T[]): Promise<(T & { cityPrices: { cityId: string; mrp: number; price: number }[] })[]> {
    if (rows.length === 0) return [];
    const all = await this.prisma.cityPrice.findMany({ where: { itemType: 'PACKAGE', itemId: { in: rows.map((r) => r.id) } } });
    return rows.map((row) => ({
      ...row,
      cityPrices: all.filter((cp) => cp.itemId === row.id).map((cp) => ({ cityId: cp.cityId, mrp: cp.mrp, price: cp.price })),
    }));
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' }) {
    return this.prisma.package.update({ where: { id }, data: { status: body.status } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [cartItems, orderItems] = await Promise.all([
      this.prisma.cartItem.count({ where: { itemType: 'PACKAGE', itemId: id } }),
      this.prisma.orderItem.count({ where: { itemType: 'PACKAGE', itemId: id } }),
    ]);
    if (cartItems > 0 || orderItems > 0) {
      throw new BadRequestException(`Cannot delete — referenced by ${cartItems} active cart(s) and ${orderItems} historical order(s). Deactivate instead.`);
    }
    // PackageItem rows cascade automatically (onDelete: Cascade on packageId) — no manual cleanup.
    // CityPrice rows don't (itemId is a loose polymorphic reference, not a real FK) — clean up explicitly.
    await this.prisma.$transaction([
      this.prisma.cityPrice.deleteMany({ where: { itemType: 'PACKAGE', itemId: id } }),
      this.prisma.package.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  private async assertItemsExist(items: UpsertPackageDto['items']) {
    if (!items?.length) return;
    const parameterIds = items.filter((i) => i.itemType === 'PARAMETER').map((i) => i.itemId);
    const profileIds = items.filter((i) => i.itemType === 'PROFILE').map((i) => i.itemId);
    const [parameterCount, profileCount] = await Promise.all([
      parameterIds.length ? this.prisma.parameter.count({ where: { id: { in: parameterIds } } }) : Promise.resolve(0),
      profileIds.length ? this.prisma.profile.count({ where: { id: { in: profileIds } } }) : Promise.resolve(0),
    ]);
    if (parameterCount !== parameterIds.length || profileCount !== profileIds.length) {
      throw new BadRequestException('One or more selected items could not be found');
    }
  }
}
