import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CityPriceDto } from './dto/city-price.dto.js';

// Parameter and Profile each have their own DB-level @unique slug, but they share one public URL
// namespace (/tests/:slug can resolve to either) — Postgres can't enforce cross-table uniqueness,
// so this check does it at the application layer, shared by both admin controllers.
@Injectable()
export class CatalogueValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSlugAvailable(slug: string, opts: { excludeParameterId?: string; excludeProfileId?: string }) {
    const [param, profile] = await Promise.all([this.prisma.parameter.findUnique({ where: { slug } }), this.prisma.profile.findUnique({ where: { slug } })]);
    if (param && param.id !== opts.excludeParameterId) throw new ConflictException('This slug is already used by another test');
    if (profile && profile.id !== opts.excludeProfileId) throw new ConflictException('This slug is already used by another test');
  }

  assertPricing(mrp: number, price: number) {
    if (price > mrp) throw new BadRequestException('Selling price cannot be greater than MRP');
  }

  async assertCategoryExists(categoryId: string | undefined) {
    if (!categoryId) return;
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException('Category not found');
  }

  // Validates city-wise pricing rows before they ever touch the database — every cityId must be
  // a real City, no city repeated, and each row's own price <= mrp (same rule as the item's base
  // pricing, just per city).
  async assertCityPrices(cityPrices: CityPriceDto[] | undefined) {
    if (!cityPrices?.length) return;
    for (const cp of cityPrices) this.assertPricing(cp.mrp, cp.price);
    const ids = cityPrices.map((cp) => cp.cityId);
    const count = await this.prisma.city.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) throw new BadRequestException('One or more selected cities could not be found');
  }

  // "Sync" write — deletes this item's existing city-price rows and recreates them from
  // `cityPrices`, inside the given transaction client so it lands atomically with the item's own
  // create/update. Call only when `cityPrices !== undefined` (mirrors the parameterIds/items
  // "only touch what was explicitly sent" convention already used by the Test/Package controllers).
  async syncCityPrices(
    tx: Prisma.TransactionClient | PrismaClient,
    itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE',
    itemId: string,
    cityPrices: CityPriceDto[],
  ) {
    await tx.cityPrice.deleteMany({ where: { itemType, itemId } });
    if (cityPrices.length) {
      await tx.cityPrice.createMany({
        data: cityPrices.map((cp) => ({ cityId: cp.cityId, itemType, itemId, mrp: cp.mrp, price: cp.price })),
      });
    }
  }
}
