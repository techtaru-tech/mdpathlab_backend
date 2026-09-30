import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How many entries each Home section returns. The app renders whatever it gets, so these are the
// single place the numbers are decided.
export const HOME_LIMITS = { banners: 5, categories: 16, popularPackages: 8, popularTests: 8, radiology: 8, offers: 5 } as const;

type ItemType = 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

// One aggregate call for the customer app's Home screen — everything visible on Home comes from
// this response. Public/unauthenticated; `upcomingBooking` stays out (the app calls GET /orders).
// Every entry carries `id`, `title` and an absolute `imageUrl` (never null — falls back to a
// placeholder when no image has been set yet, so the app never has to guess a local icon).
@Controller('home')
export class HomeController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly coupons: CouponsService,
    private readonly prisma: PrismaService,
  ) {}

  // `lat`/`lng` are accepted so the app can send them, but ranking is city-wide ("most booked" in
  // the selected city's catalogue) — resolving cityId client-side is enough; they are not used yet.
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async get(
    @Req() req: Request,
    @Query('cityId') cityId?: string,
    @Query('lat') _lat?: string,
    @Query('lng') _lng?: string,
  ) {
    const base = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const placeholder = process.env.HOME_PLACEHOLDER_IMAGE_URL ?? `${base}/uploads/placeholder.png`;
    const img = (url?: string | null) => (!url ? placeholder : /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`);

    const [banners, categories, tests, packages, radiology, coupons, bookingCounts] = await Promise.all([
      this.prisma.appBanner.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: HOME_LIMITS.banners }),
      this.catalogue.listCategories(cityId),
      this.catalogue.listTests(cityId),
      this.catalogue.listPackages(cityId),
      this.catalogue.listRadiology(cityId),
      this.coupons.listActive(),
      this.prisma.orderItem.groupBy({
        by: ['itemType', 'itemId'],
        where: { order: { status: { not: 'CANCELLED' } } },
        _count: { _all: true },
      }),
    ]);

    const booked = new Map<string, number>(bookingCounts.map((b) => [`${b.itemType}:${b.itemId}`, b._count._all]));
    const countOf = (type: ItemType, id: string) => booked.get(`${type}:${id}`) ?? 0;
    // Most booked first; never-booked items keep the catalogue's own order so lists still fill up.
    const rank = <T extends { id: string }>(rows: T[], type: (r: T) => ItemType) =>
      rows
        .map((r, i) => ({ r, i, n: countOf(type(r), r.id) }))
        .sort((a, b) => b.n - a.n || a.i - b.i);

    const rankedPackages = rank(packages, () => 'PACKAGE').slice(0, HOME_LIMITS.popularPackages);
    const rankedTests = rank(tests, (t) => t.itemType).slice(0, HOME_LIMITS.popularTests);
    const rankedRadiology = rank(radiology, () => 'RADIOLOGY').slice(0, HOME_LIMITS.radiology);

    return {
      banners: banners.map((b) => ({ id: b.id, imageUrl: img(b.imageUrl) })),

      categories: categories.slice(0, HOME_LIMITS.categories).map((c) => ({
        id: c.id,
        title: c.name,
        slug: c.slug,
        imageUrl: img(c.imageUrl),
      })),

      popularPackages: rankedPackages.map(({ r: p, n }) => ({
        id: p.id,
        itemType: 'PACKAGE' as const,
        slug: p.slug,
        title: p.name,
        imageUrl: img(p.imageUrl),
        price: p.price,
        mrp: p.mrp,
        parameterCount: p.displayParameterCount ?? p.items.length,
        labels: [...(p.badge ? [p.badge] : []), ...(n > 0 ? ['Most booked'] : [])],
      })),

      popularTests: rankedTests.map(({ r: t }) => ({
        id: t.id,
        itemType: t.itemType,
        slug: t.slug,
        title: t.name,
        imageUrl: img(t.imageUrl),
        price: t.price,
        mrp: t.mrp,
      })),

      radiology: rankedRadiology.map(({ r }) => ({
        id: r.id,
        itemType: 'RADIOLOGY' as const,
        slug: r.slug,
        title: r.name,
        imageUrl: img(r.imageUrl),
        price: r.price,
        mrp: r.mrp,
      })),

      offers: coupons.slice(0, HOME_LIMITS.offers).map((c) => ({
        id: c.id,
        title: c.type === 'PERCENT' ? `${c.value}% off` : `₹${c.value} off`,
        subtitle: `Use code ${c.code}${c.minOrderValue ? ` · Min order ₹${c.minOrderValue}` : ''}`,
        code: c.code,
        imageUrl: img(c.imageUrl),
      })),
    };
  }
}
