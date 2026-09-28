import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Category, CityPrice, Parameter, Profile, RadiologyTest } from '@prisma/client';

// The public "Test" listing is a permanent union of two tables:
//  - Parameter: the 8 pre-existing rows, created before the admin Test/Profile module existed.
//    Live CartItem/OrderItem rows already reference them by id, so they can never be migrated or
//    deactivated — see prisma/schema.prisma's Parameter comment.
//  - Profile: every Test an admin creates going forward, via the Tests module, with real
//    ProfileParameter links for "parameters covered".
// Both are normalized into one shape here so the frontend only needs one Test type, with
// `itemType` distinguishing which table a given row actually lives in for booking purposes.
type ParameterWithCategory = Parameter & { category: Category | null };
type ProfileWithParameters = Profile & { category: Category | null; parameters: { parameter: Parameter }[] };
type RadiologyWithCategory = RadiologyTest & { category: Category | null };

function normalizeCategory(c: Category | null) {
  return c ? { id: c.id, name: c.name, slug: c.slug } : null;
}

// keyed `${itemType}:${itemId}` -> that city's override, built once per request by loadCityPrices()
type CityPriceMap = Map<string, { mrp: number; price: number }>;

function priceKey(itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY', itemId: string) {
  return `${itemType}:${itemId}`;
}

function normalizeParameter(p: ParameterWithCategory, cityPrices?: CityPriceMap) {
  const override = cityPrices?.get(priceKey('PARAMETER', p.id));
  return {
    itemType: 'PARAMETER' as const,
    id: p.id,
    name: p.name,
    slug: p.slug,
    testCode: null,
    shortDescription: p.shortDescription,
    sampleType: null,
    preparationInstructions: null,
    category: normalizeCategory(p.category),
    mrp: override?.mrp ?? p.mrp,
    price: override?.price ?? p.price,
    sampleCollection: p.sampleCollection,
    reportTimeHours: p.reportTimeHours,
    fastingRequired: p.fastingRequired,
    fastingHours: p.fastingHours,
    tag: p.tag,
    parametersCovered: [] as string[],
    displayParameterCount: p.displayParameterCount,
    createdAt: p.createdAt,
  };
}

// A radiology test is never bundled from Parameters (see prisma/schema.prisma's RadiologyTest
// comment), so unlike a Profile it has no "parameters covered" — normalized to the same shape
// as the frontend's Test type regardless, with `parametersCovered`/`sampleType` always empty.
function normalizeRadiology(p: RadiologyWithCategory, cityPrices?: CityPriceMap) {
  const override = cityPrices?.get(priceKey('RADIOLOGY', p.id));
  return {
    itemType: 'RADIOLOGY' as const,
    id: p.id,
    name: p.name,
    slug: p.slug,
    testCode: p.testCode,
    shortDescription: p.shortDescription,
    sampleType: null as string | null,
    preparationInstructions: p.preparationInstructions,
    category: normalizeCategory(p.category),
    mrp: override?.mrp ?? p.mrp,
    price: override?.price ?? p.price,
    sampleCollection: 'LAB' as const,
    reportTimeHours: p.reportTimeHours,
    fastingRequired: p.fastingRequired,
    fastingHours: p.fastingHours,
    tag: p.tag,
    modality: p.modality,
    parametersCovered: [] as string[],
    displayParameterCount: null as number | null,
    createdAt: p.createdAt,
  };
}

function normalizeProfile(p: ProfileWithParameters, cityPrices?: CityPriceMap) {
  const parametersCovered = p.parameters.map((link) => link.parameter.name);
  const override = cityPrices?.get(priceKey('PROFILE', p.id));
  return {
    itemType: 'PROFILE' as const,
    id: p.id,
    name: p.name,
    slug: p.slug,
    testCode: p.testCode,
    shortDescription: p.shortDescription,
    sampleType: p.sampleType,
    preparationInstructions: p.preparationInstructions,
    category: normalizeCategory(p.category),
    mrp: override?.mrp ?? p.mrp,
    price: override?.price ?? p.price,
    sampleCollection: p.sampleCollection,
    reportTimeHours: p.reportTimeHours,
    fastingRequired: p.fastingRequired,
    fastingHours: p.fastingHours,
    tag: p.tag,
    parametersCovered,
    displayParameterCount: parametersCovered.length,
    createdAt: p.createdAt,
  };
}

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  // Builds the override map for a request — one query regardless of how many items are being
  // normalized, since the customer's selected city is fixed per request. Returns undefined for
  // no cityId so every normalize*() call above cleanly falls through to the base mrp/price.
  private async loadCityPrices(
    cityId: string | undefined,
    itemType?: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY',
  ): Promise<CityPriceMap | undefined> {
    if (!cityId) return undefined;
    const rows = await this.prisma.cityPrice.findMany({ where: { cityId, ...(itemType ? { itemType } : {}) } });
    return new Map(
      rows.map((r: CityPrice) => [priceKey(r.itemType as 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY', r.itemId), { mrp: r.mrp, price: r.price }]),
    );
  }

  async listTests(cityId?: string) {
    // code:null scopes this to the 8 legacy standalone rows — a Parameter with a code is an
    // atomic marker meant only as a Profile's ProfileParameter component, never independently
    // bookable (see prisma/schema.prisma's Parameter comment).
    const [parameters, profiles, cityPrices] = await Promise.all([
      this.prisma.parameter.findMany({ where: { status: 'ACTIVE', code: null }, include: { category: true } }),
      this.prisma.profile.findMany({
        where: { status: 'ACTIVE' },
        include: { category: true, parameters: { include: { parameter: true } } },
      }),
      this.loadCityPrices(cityId),
    ]);
    return [
      ...parameters.filter((p) => this.isAvailableInCity('PARAMETER', p.id, cityPrices)).map((p) => normalizeParameter(p, cityPrices)),
      ...profiles.filter((p) => this.isAvailableInCity('PROFILE', p.id, cityPrices)).map((p) => normalizeProfile(p, cityPrices)),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getTest(slug: string, cityId?: string) {
    const [parameter, profile] = await Promise.all([
      this.prisma.parameter.findUnique({ where: { slug }, include: { category: true } }),
      this.prisma.profile.findUnique({
        where: { slug },
        include: { category: true, parameters: { include: { parameter: true } } },
      }),
    ]);
    const cityPrices = await this.loadCityPrices(cityId);
    if (parameter && !parameter.code && this.isAvailableInCity('PARAMETER', parameter.id, cityPrices)) {
      return normalizeParameter(parameter, cityPrices);
    }
    if (profile && this.isAvailableInCity('PROFILE', profile.id, cityPrices)) {
      return normalizeProfile(profile, cityPrices);
    }
    throw new NotFoundException('Test not found');
  }

  // A city not covered by any CityPrice row for this item hides it there entirely — the same
  // per-city list an admin already maintains for pricing now doubles as "is this item sellable in
  // this city at all." No cityId (city not yet resolved, or an admin/internal caller) means show
  // everything, same as before this existed.
  private isAvailableInCity(itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY', itemId: string, cityPrices?: CityPriceMap) {
    return !cityPrices || cityPrices.has(priceKey(itemType, itemId));
  }

  async listRadiology(cityId?: string) {
    const [rows, cityPrices] = await Promise.all([
      this.prisma.radiologyTest.findMany({ where: { status: 'ACTIVE' }, include: { category: true }, orderBy: { createdAt: 'asc' } }),
      this.loadCityPrices(cityId, 'RADIOLOGY'),
    ]);
    return rows.filter((r) => this.isAvailableInCity('RADIOLOGY', r.id, cityPrices)).map((r) => normalizeRadiology(r, cityPrices));
  }

  async getRadiology(slug: string, cityId?: string) {
    const row = await this.prisma.radiologyTest.findUnique({ where: { slug }, include: { category: true } });
    const cityPrices = await this.loadCityPrices(cityId, 'RADIOLOGY');
    if (!row || !this.isAvailableInCity('RADIOLOGY', row.id, cityPrices)) throw new NotFoundException('Radiology test not found');
    return normalizeRadiology(row, cityPrices);
  }

  /**
   * Public "browse by category" list for the header mega-menu and homepage quick-links — active
   * categories with a live test count, up to 4 featured packages ("Preventive Packages for
   * {category}"), and up to 4 individual tests as a fallback for a category with no packages yet
   * (never leaves the mega-menu panel empty). Four queries total regardless of category count —
   * grouped in memory rather than one round trip per category, since this loads on every page.
   */
  async listCategories(cityId?: string) {
    const [categories, packages, parameters, profiles, cityPrices] = await Promise.all([
      this.prisma.category.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.package.findMany({
        where: { status: 'ACTIVE', categoryId: { not: null } },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.parameter.findMany({ where: { status: 'ACTIVE', code: null, categoryId: { not: null } } }),
      this.prisma.profile.findMany({
        where: { status: 'ACTIVE', categoryId: { not: null } },
        include: { parameters: true },
      }),
      this.loadCityPrices(cityId),
    ]);

    return categories.map((c) => {
      const catPackages = packages.filter((p) => p.categoryId === c.id && this.isAvailableInCity('PACKAGE', p.id, cityPrices));
      const catParameters = parameters.filter((p) => p.categoryId === c.id && this.isAvailableInCity('PARAMETER', p.id, cityPrices));
      const catProfiles = profiles.filter((p) => p.categoryId === c.id && this.isAvailableInCity('PROFILE', p.id, cityPrices));

      const tests = [
        ...catParameters.map((p) => ({
          itemType: 'PARAMETER' as const,
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          mrp: p.mrp,
          reportTimeHours: p.reportTimeHours,
          displayParameterCount: p.displayParameterCount ?? 1,
          tag: p.tag,
        })),
        ...catProfiles.map((p) => ({
          itemType: 'PROFILE' as const,
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          mrp: p.mrp,
          reportTimeHours: p.reportTimeHours,
          displayParameterCount: p.parameters.length,
          tag: p.tag,
        })),
      ];

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        testCount: catParameters.length + catProfiles.length,
        packages: catPackages.slice(0, 4).map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          mrp: p.mrp,
          reportTimeHours: p.reportTimeHours,
          displayParameterCount: p.displayParameterCount ?? 0,
        })),
        // Capped generously (not the tight 4-item preview cap `packages` uses) because Full Body
        // Checkup's header dropdown buckets these by `tag` into several sub-nav panes (Blood
        // Tests, Tests by Health Risks, etc.) and needs enough rows per bucket — see
        // CategoryMegaMenu.tsx's FullBodyCheckupPanel. Every other category's panel only ever
        // reads this as a packages-fallback and slices its own first 4 client-side.
        tests: tests.slice(0, 60),
      };
    });
  }

  async listPackages(cityId?: string) {
    const [packages, cityPrices] = await Promise.all([
      this.prisma.package.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: { items: { include: { parameter: true, profile: true } } },
      }),
      this.loadCityPrices(cityId, 'PACKAGE'),
    ]);
    return packages
      .filter((pkg) => this.isAvailableInCity('PACKAGE', pkg.id, cityPrices))
      .map((pkg) => this.applyPackagePrice(pkg, cityPrices));
  }

  async getPackage(slug: string, cityId?: string) {
    const [pkg, cityPrices] = await Promise.all([
      this.prisma.package.findUnique({
        where: { slug },
        include: { items: { include: { parameter: true, profile: true } } },
      }),
      this.loadCityPrices(cityId, 'PACKAGE'),
    ]);
    if (!pkg || !this.isAvailableInCity('PACKAGE', pkg.id, cityPrices)) throw new NotFoundException('Package not found');
    return this.applyPackagePrice(pkg, cityPrices);
  }

  private applyPackagePrice<T extends { id: string; mrp: number; price: number }>(pkg: T, cityPrices?: CityPriceMap): T {
    const override = cityPrices?.get(priceKey('PACKAGE', pkg.id));
    if (!override) return pkg;
    return { ...pkg, mrp: override.mrp, price: override.price };
  }

  /**
   * Resolves a bookable item's current name/price/mrp/status by id, regardless of which table
   * it lives in. Used by Cart and Orders so a price is always read fresh from the catalogue —
   * never trusted from client input. `cityId`, when given, applies that city's price override.
   */
  async resolveItem(itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY', itemId: string, cityId?: string) {
    const row =
      itemType === 'PARAMETER'
        ? await this.prisma.parameter.findUnique({ where: { id: itemId } })
        : itemType === 'PROFILE'
          ? await this.prisma.profile.findUnique({ where: { id: itemId } })
          : itemType === 'RADIOLOGY'
            ? await this.prisma.radiologyTest.findUnique({ where: { id: itemId } })
            : await this.prisma.package.findUnique({ where: { id: itemId } });

    if (!row || row.status !== 'ACTIVE') {
      throw new NotFoundException('Item not found or no longer available');
    }

    let { mrp, price } = row;
    if (cityId) {
      const override = await this.prisma.cityPrice.findUnique({
        where: { cityId_itemType_itemId: { cityId, itemType, itemId } },
      });
      if (override) {
        mrp = override.mrp;
        price = override.price;
      }
    }

    return { id: row.id, name: row.name, slug: row.slug, price, mrp, reportTimeHours: row.reportTimeHours };
  }
}
