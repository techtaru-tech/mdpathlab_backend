import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { haversineKm } from '../common/distance.js';

// Public, read-only view of the same CollectionCenter rows the admin module manages —
// deliberately no separate model/table, just a patient-facing projection of real data.
@Controller('collection-centers')
export class CollectionCentersController {
  constructor(private readonly prisma: PrismaService) {}

  // `lat`/`lng` are optional — when given (the app already resolves the user's position via its
  // own Google Maps integration, see CUSTOMER_APP_BACKEND_REQUIREMENTS_MAPPING.md §2), each
  // centre's `distanceKm` is computed server-side with the same haversineKm() helper
  // OrdersService already uses for the home-collection fee, so the two can never disagree — and
  // the list is sorted nearest-first. With no lat/lng, `distanceKm` is null and the order is
  // alphabetical, same as before.
  @Get()
  async list(@Query('lat') latRaw?: string, @Query('lng') lngRaw?: string) {
    const centres = await this.prisma.collectionCenter.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, address: true, phone: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    });

    const lat = latRaw !== undefined ? Number(latRaw) : NaN;
    const lng = lngRaw !== undefined ? Number(lngRaw) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return centres.map((c) => ({ ...c, distanceKm: null as number | null }));
    }

    return centres
      .map((c) => ({
        ...c,
        distanceKm: c.lat !== null && c.lng !== null ? Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10 : null,
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }
}
