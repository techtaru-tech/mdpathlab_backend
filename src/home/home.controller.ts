import { Controller, Get, Query } from '@nestjs/common';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { OffersService } from '../offers/offers.service.js';

const PREVIEW_COUNT = 8;

// One aggregate call for the customer app's Home screen (see
// CUSTOMER_APP_BACKEND_REQUIREMENTS_MAPPING.md §5) — every section is city-aware (same cityId
// param the underlying catalogue calls already accept), reusing those exact same, already-tested
// service methods rather than a second parallel query path. Deliberately public/unauthenticated,
// same as the calls it wraps: `upcomingBooking` is NOT included here — a logged-in app should
// call the existing (authenticated) `GET /orders` itself for that, rather than this endpoint
// needing to handle "maybe logged in, maybe not."
@Controller('home')
export class HomeController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly offers: OffersService,
  ) {}

  @Get()
  async get(@Query('cityId') cityId?: string) {
    const [categories, tests, packages, radiology, offers] = await Promise.all([
      this.catalogue.listCategories(cityId),
      this.catalogue.listTests(cityId),
      this.catalogue.listPackages(cityId),
      this.catalogue.listRadiology(cityId),
      this.offers.listActive(),
    ]);

    return {
      categories,
      popularTests: tests.slice(0, PREVIEW_COUNT),
      popularPackages: packages.slice(0, PREVIEW_COUNT),
      radiology: radiology.slice(0, PREVIEW_COUNT),
      offers,
    };
  }
}
