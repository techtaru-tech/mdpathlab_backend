import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Category, Parameter, Profile } from '@prisma/client';

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

function normalizeCategory(c: Category | null) {
  return c ? { id: c.id, name: c.name, slug: c.slug } : null;
}

function normalizeParameter(p: ParameterWithCategory) {
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
    mrp: p.mrp,
    price: p.price,
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

function normalizeProfile(p: ProfileWithParameters) {
  const parametersCovered = p.parameters.map((link) => link.parameter.name);
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
    mrp: p.mrp,
    price: p.price,
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

  async listTests() {
    // code:null scopes this to the 8 legacy standalone rows — a Parameter with a code is an
    // atomic marker meant only as a Profile's ProfileParameter component, never independently
    // bookable (see prisma/schema.prisma's Parameter comment).
    const [parameters, profiles] = await Promise.all([
      this.prisma.parameter.findMany({ where: { status: 'ACTIVE', code: null }, include: { category: true } }),
      this.prisma.profile.findMany({
        where: { status: 'ACTIVE' },
        include: { category: true, parameters: { include: { parameter: true } } },
      }),
    ]);
    return [...parameters.map(normalizeParameter), ...profiles.map(normalizeProfile)].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async getTest(slug: string) {
    const [parameter, profile] = await Promise.all([
      this.prisma.parameter.findUnique({ where: { slug }, include: { category: true } }),
      this.prisma.profile.findUnique({
        where: { slug },
        include: { category: true, parameters: { include: { parameter: true } } },
      }),
    ]);
    if (parameter && !parameter.code) return normalizeParameter(parameter);
    if (profile) return normalizeProfile(profile);
    throw new NotFoundException('Test not found');
  }

  /**
   * Public "browse by category" list for the header mega-menu and homepage quick-links — active
   * categories with a live test count, up to 4 featured packages ("Preventive Packages for
   * {category}"), and up to 4 individual tests as a fallback for a category with no packages yet
   * (never leaves the mega-menu panel empty). Four queries total regardless of category count —
   * grouped in memory rather than one round trip per category, since this loads on every page.
   */
  async listCategories() {
    const [categories, packages, parameters, profiles] = await Promise.all([
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
    ]);

    return categories.map((c) => {
      const catPackages = packages.filter((p) => p.categoryId === c.id);
      const catParameters = parameters.filter((p) => p.categoryId === c.id);
      const catProfiles = profiles.filter((p) => p.categoryId === c.id);

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

  listPackages() {
    return this.prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { parameter: true, profile: true } } },
    });
  }

  async getPackage(slug: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { slug },
      include: { items: { include: { parameter: true, profile: true } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  /**
   * Resolves a bookable item's current name/price/mrp/status by id, regardless of which table
   * it lives in. Used by Cart and Orders so a price is always read fresh from the catalogue —
   * never trusted from client input.
   */
  async resolveItem(itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE', itemId: string) {
    const row =
      itemType === 'PARAMETER'
        ? await this.prisma.parameter.findUnique({ where: { id: itemId } })
        : itemType === 'PROFILE'
          ? await this.prisma.profile.findUnique({ where: { id: itemId } })
          : await this.prisma.package.findUnique({ where: { id: itemId } });

    if (!row || row.status !== 'ACTIVE') {
      throw new NotFoundException('Item not found or no longer available');
    }
    return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, reportTimeHours: row.reportTimeHours };
  }
}
