import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
