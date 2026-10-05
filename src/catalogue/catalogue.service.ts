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
    imageUrl: p.imageUrl,
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
    imageUrl: p.imageUrl,
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
    imageUrl: p.imageUrl,
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

  // Mobile/web clients sometimes send the city slug ("jaipur") where a cityId is expected. Accept
  // either; an unknown value is treated as "city not resolved" (show everything) instead of
  // silently hiding every item, which is what an unmatched id used to do.
  private async resolveCityId(value: string | undefined): Promise<string | undefined> {
    const v = value?.trim();
    if (!v) return undefined;
    const city = await this.prisma.city.findFirst({ where: { OR: [{ id: v }, { slug: { equals: v, mode: 'insensitive' } }, { name: { equals: v, mode: 'insensitive' } }] }, select: { id: true } });
    return city?.id;
  }

  // Builds the override map for a request — one query regardless of how many items are being
  // normalized, since the customer's selected city is fixed per request. Returns undefined for
  // no cityId so every normalize*() call above cleanly falls through to the base mrp/price.
  private async loadCityPrices(
    cityId: string | undefined,
    itemType?: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY',
  ): Promise<CityPriceMap | undefined> {
    const resolvedCityId = await this.resolveCityId(cityId);
    if (!resolvedCityId) return undefined;
    const rows = await this.prisma.cityPrice.findMany({ where: { cityId: resolvedCityId, ...(itemType ? { itemType } : {}) } });
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

  // Unlike Test/Package/Parameter, radiology is NOT city-gated: a new radiology item is visible
  // everywhere the moment an admin activates it, with no per-city CityPrice row required first.
  // (Test/Package treat "no CityPrice row for this city" as "hidden there" — deliberate, so a
  // city launch can be staged item-by-item — but radiology's admin form is intentionally simple
  // with no CityPriceEditor, so that same rule would silently hide every new radiology item in
  // every city until someone remembered to add city pricing for it.) A CityPrice row, if one
  // exists, still overrides the price shown — it just never gates visibility.
  async listRadiology(cityId?: string) {
    const [rows, cityPrices] = await Promise.all([
      this.prisma.radiologyTest.findMany({ where: { status: 'ACTIVE' }, include: { category: true }, orderBy: { createdAt: 'asc' } }),
      this.loadCityPrices(cityId, 'RADIOLOGY'),
    ]);
    return rows.map((r) => normalizeRadiology(r, cityPrices));
  }

  async getRadiology(slug: string, cityId?: string) {
    const row = await this.prisma.radiologyTest.findUnique({ where: { slug }, include: { category: true } });
    if (!row) throw new NotFoundException('Radiology test not found');
    const cityPrices = await this.loadCityPrices(cityId, 'RADIOLOGY');
    return normalizeRadiology(row, cityPrices);
  }

  /**
   * Server-side equivalent of what the web app already does client-side against its own
   * already-fetched lists (see CUSTOMER_APP_BACKEND_REQUIREMENTS_MAPPING.md §3) — reuses the
   * exact same normalized rows listTests()/listPackages()/listRadiology() already produce (same
   * city-price rules, same availability rules) rather than a separate raw-SQL path that could
   * drift from what browsing actually shows.
   */
  async search(q: string, cityId?: string) {
    const query = q.trim().toLowerCase();
    if (!query) return { tests: [], packages: [], radiology: [] };

    const [tests, packages, radiology] = await Promise.all([this.listTests(cityId), this.listPackages(cityId), this.listRadiology(cityId)]);
    const matches = (...values: (string | null | undefined)[]) => values.some((v) => v?.toLowerCase().includes(query));

    return {
      tests: tests.filter((t) => matches(t.name, t.category?.name, ...t.parametersCovered)),
      packages: packages.filter((p) => matches(p.name, p.subtitle)),
      radiology: radiology.filter((r) => matches(r.name, r.category?.name, r.modality)),
    };
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
        imageUrl: c.imageUrl,
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
        include: { category: true, items: { include: { parameter: true, profile: true } } },
      }),
      this.loadCityPrices(cityId, 'PACKAGE'),
    ]);
    return packages
      .filter((pkg) => this.isAvailableInCity('PACKAGE', pkg.id, cityPrices))
      .map((pkg) => this.applyPackagePrice(pkg, cityPrices));
  }

  /**
   * One unified, filterable, paginated list of everything bookable — tests, packages and radiology
   * — each with the details a listing card or detail header needs. Reuses listTests()/listPackages()/
   * listRadiology() so city pricing and availability rules can never drift from the per-type lists.
   */
  async listItems(opts: {
    type?: string;
    category?: string;
    search?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
    cityId?: string;
  }) {
    const type = (opts.type ?? 'all').toLowerCase();
    const [tests, packages, radiology] = await Promise.all([
      type === 'all' || type === 'test' ? this.listTests(opts.cityId) : [],
      type === 'all' || type === 'package' ? this.listPackages(opts.cityId) : [],
      type === 'all' || type === 'radiology' ? this.listRadiology(opts.cityId) : [],
    ]);

    const discount = (mrp: number, price: number) => (mrp > 0 && price < mrp ? Math.round(((mrp - price) / mrp) * 100) : 0);
    const items = [
      ...tests.map((t) => ({
        id: t.id,
        itemType: t.itemType as string,
        slug: t.slug,
        title: t.name,
        imageUrl: t.imageUrl ?? null,
        shortDescription: t.shortDescription,
        category: t.category,
        price: t.price,
        mrp: t.mrp,
        discountPercent: discount(t.mrp, t.price),
        reportTimeHours: t.reportTimeHours,
        fastingRequired: t.fastingRequired,
        fastingHours: t.fastingHours,
        sampleCollection: t.sampleCollection as string,
        parameterCount: t.displayParameterCount ?? t.parametersCovered.length,
        includes: t.parametersCovered,
        preparationInstructions: t.preparationInstructions,
        labels: t.tag ? [t.tag] : [],
        modality: null as string | null,
      })),
      ...packages.map((p) => ({
        id: p.id,
        itemType: 'PACKAGE',
        slug: p.slug,
        title: p.name,
        imageUrl: p.imageUrl ?? null,
        shortDescription: p.subtitle,
        category: normalizeCategory(p.category ?? null),
        price: p.price,
        mrp: p.mrp,
        discountPercent: discount(p.mrp, p.price),
        reportTimeHours: p.reportTimeHours,
        fastingRequired: p.fastingRequired,
        fastingHours: p.fastingHours,
        sampleCollection: 'BOTH',
        parameterCount: p.displayParameterCount ?? p.items.length,
        includes: p.items.map((i) => i.profile?.name ?? i.parameter?.name).filter((n): n is string => Boolean(n)),
        preparationInstructions: null as string | null,
        labels: [...(p.badge ? [p.badge] : []), ...(p.isFeatured ? ['Featured'] : [])],
        modality: null as string | null,
        bestFor: p.bestFor,
        highlights: p.highlights,
      })),
      ...radiology.map((r) => ({
        id: r.id,
        itemType: 'RADIOLOGY',
        slug: r.slug,
        title: r.name,
        imageUrl: r.imageUrl ?? null,
        shortDescription: r.shortDescription,
        category: r.category,
        price: r.price,
        mrp: r.mrp,
        discountPercent: discount(r.mrp, r.price),
        reportTimeHours: r.reportTimeHours,
        fastingRequired: r.fastingRequired,
        fastingHours: r.fastingHours,
        sampleCollection: 'LAB',
        parameterCount: 0,
        includes: [] as string[],
        preparationInstructions: r.preparationInstructions,
        labels: r.tag ? [r.tag] : [],
        modality: r.modality ?? null,
      })),
    ];

    const q = opts.search?.trim().toLowerCase();
    const cat = opts.category?.trim().toLowerCase();
    const filtered = items.filter(
      (i) =>
        (!cat || i.category?.slug.toLowerCase() === cat || i.category?.id === opts.category) &&
        (!q || i.title.toLowerCase().includes(q) || i.category?.name.toLowerCase().includes(q) || i.includes.some((n) => n.toLowerCase().includes(q))),
    );

    if (opts.sort === 'price_asc') filtered.sort((a, b) => a.price - b.price);
    else if (opts.sort === 'price_desc') filtered.sort((a, b) => b.price - a.price);
    else if (opts.sort === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (opts.sort === 'discount') filtered.sort((a, b) => b.discountPercent - a.discountPercent);

    const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
    const total = filtered.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(Math.max(opts.page ?? 1, 1), totalPages);
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages };
  }

  /**
   * Full detail for one bookable item, looked up by slug across packages, tests and radiology (pass
   * `type` to disambiguate if two tables ever share a slug). Same city-price/availability rules as
   * the per-type getters; adds what a detail screen needs — included parameters with reference
   * ranges for a test, and each included test (with its own parameters) for a package.
   */
  async getItemDetail(slug: string, opts: { type?: string; cityId?: string } = {}) {
    const type = (opts.type ?? '').toLowerCase();
    const discount = (mrp: number, price: number) => (mrp > 0 && price < mrp ? Math.round(((mrp - price) / mrp) * 100) : 0);

    if (!type || type === 'package') {
      const [pkg, cityPrices] = await Promise.all([
        this.prisma.package.findUnique({
          where: { slug },
          include: {
            category: true,
            items: { include: { parameter: true, profile: { include: { parameters: { include: { parameter: true } } } } } },
          },
        }),
        this.loadCityPrices(opts.cityId, 'PACKAGE'),
      ]);
      if (pkg && pkg.status === 'ACTIVE' && this.isAvailableInCity('PACKAGE', pkg.id, cityPrices)) {
        const p = this.applyPackagePrice(pkg, cityPrices);
        const includedItems = p.items.map((i) => ({
          itemType: i.profile ? 'PROFILE' : 'PARAMETER',
          name: i.profile?.name ?? i.parameter?.name ?? 'Unavailable item',
          slug: i.profile?.slug ?? i.parameter?.slug ?? null,
          parameters: i.profile ? i.profile.parameters.map((l) => l.parameter.name) : [],
        }));
        return {
          id: p.id,
          itemType: 'PACKAGE',
          slug: p.slug,
          title: p.name,
          imageUrl: p.imageUrl ?? null,
          shortDescription: p.subtitle,
          category: normalizeCategory(p.category ?? null),
          price: p.price,
          mrp: p.mrp,
          discountPercent: discount(p.mrp, p.price),
          reportTimeHours: p.reportTimeHours,
          fastingRequired: p.fastingRequired,
          fastingHours: p.fastingHours,
          sampleCollection: 'BOTH',
          parameterCount: p.displayParameterCount ?? p.items.length,
          labels: [...(p.badge ? [p.badge] : []), ...(p.isFeatured ? ['Featured'] : [])],
          bestFor: p.bestFor,
          highlights: p.highlights,
          includedItems,
          preparationInstructions: null as string | null,
        };
      }
    }

    if (!type || type === 'test') {
      const [profile, parameter, cityPrices] = await Promise.all([
        this.prisma.profile.findUnique({ where: { slug }, include: { category: true, parameters: { include: { parameter: true } } } }),
        this.prisma.parameter.findUnique({ where: { slug }, include: { category: true } }),
        this.loadCityPrices(opts.cityId),
      ]);
      if (profile && profile.status === 'ACTIVE' && this.isAvailableInCity('PROFILE', profile.id, cityPrices)) {
        const t = normalizeProfile(profile, cityPrices);
        return {
          id: t.id,
          itemType: 'PROFILE',
          slug: t.slug,
          title: t.name,
          imageUrl: t.imageUrl ?? null,
          shortDescription: t.shortDescription,
          category: t.category,
          price: t.price,
          mrp: t.mrp,
          discountPercent: discount(t.mrp, t.price),
          reportTimeHours: t.reportTimeHours,
          fastingRequired: t.fastingRequired,
          fastingHours: t.fastingHours,
          sampleCollection: t.sampleCollection as string,
          parameterCount: t.displayParameterCount ?? t.parametersCovered.length,
          labels: t.tag ? [t.tag] : [],
          testCode: t.testCode,
          sampleType: t.sampleType,
          preparationInstructions: t.preparationInstructions,
          parameters: profile.parameters.map((l) => ({
            name: l.parameter.name,
            referenceRange: l.parameter.referenceRange ?? null,
            shortDescription: l.parameter.shortDescription ?? null,
          })),
        };
      }
      if (parameter && !parameter.code && parameter.status === 'ACTIVE' && this.isAvailableInCity('PARAMETER', parameter.id, cityPrices)) {
        const t = normalizeParameter(parameter, cityPrices);
        return {
          id: t.id,
          itemType: 'PARAMETER',
          slug: t.slug,
          title: t.name,
          imageUrl: t.imageUrl ?? null,
          shortDescription: t.shortDescription,
          category: t.category,
          price: t.price,
          mrp: t.mrp,
          discountPercent: discount(t.mrp, t.price),
          reportTimeHours: t.reportTimeHours,
          fastingRequired: t.fastingRequired,
          fastingHours: t.fastingHours,
          sampleCollection: t.sampleCollection as string,
          parameterCount: t.displayParameterCount ?? 1,
          labels: t.tag ? [t.tag] : [],
          testCode: null as string | null,
          sampleType: null as string | null,
          preparationInstructions: null as string | null,
          parameters: [{ name: t.name, referenceRange: parameter.referenceRange ?? null, shortDescription: t.shortDescription }],
        };
      }
    }

    if (!type || type === 'radiology') {
      const [row, cityPrices] = await Promise.all([
        this.prisma.radiologyTest.findUnique({ where: { slug }, include: { category: true } }),
        this.loadCityPrices(opts.cityId, 'RADIOLOGY'),
      ]);
      if (row && row.status === 'ACTIVE') {
        const r = normalizeRadiology(row, cityPrices);
        return {
          id: r.id,
          itemType: 'RADIOLOGY',
          slug: r.slug,
          title: r.name,
          imageUrl: r.imageUrl ?? null,
          shortDescription: r.shortDescription,
          category: r.category,
          price: r.price,
          mrp: r.mrp,
          discountPercent: discount(r.mrp, r.price),
          reportTimeHours: r.reportTimeHours,
          fastingRequired: r.fastingRequired,
          fastingHours: r.fastingHours,
          sampleCollection: 'LAB',
          parameterCount: 0,
          labels: r.tag ? [r.tag] : [],
          testCode: r.testCode,
          modality: r.modality ?? null,
          preparationInstructions: r.preparationInstructions,
        };
      }
    }

    throw new NotFoundException('Item not found');
  }

  /**
   * Everything bookable under one category — tests, packages and radiology — as one list, no
   * pagination (a category holds a few dozen items at most). `category` is a slug or id.
   */
  async listCategoryItems(category: string, cityId?: string) {
    const row = await this.prisma.category.findFirst({
      where: { status: 'ACTIVE', OR: [{ id: category }, { slug: { equals: category, mode: 'insensitive' } }] },
    });
    if (!row) throw new NotFoundException('Category not found');
    const result = await this.listItems({ category: row.slug, cityId, pageSize: 100 });
    return {
      category: { id: row.id, name: row.name, slug: row.slug, imageUrl: row.imageUrl },
      total: result.total,
      items: result.items,
    };
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
