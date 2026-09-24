// One-off backfill: gives every existing Parameter/Profile("Test")/Package a CityPrice row for
// every currently-existing City, defaulting each to that item's own current mrp/price — so an
// admin opening any catalogue item's "City-wise pricing" editor sees every city pre-populated
// (ready to tweak individually) instead of an empty list they'd have to build up one city at a
// time. Idempotent and non-destructive: never touches a (city, item) pair that already has a
// CityPrice row, so it's safe to re-run any time a new city or a new catalogue item is added.
//
// Usage: npx tsx scripts/backfill-city-prices.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [cities, parameters, profiles, packages, existing] = await Promise.all([
    prisma.city.findMany(),
    prisma.parameter.findMany(),
    prisma.profile.findMany(),
    prisma.package.findMany(),
    prisma.cityPrice.findMany(),
  ]);

  const items = [
    ...parameters.map((p) => ({ itemType: 'PARAMETER' as const, id: p.id, mrp: p.mrp, price: p.price })),
    ...profiles.map((p) => ({ itemType: 'PROFILE' as const, id: p.id, mrp: p.mrp, price: p.price })),
    ...packages.map((p) => ({ itemType: 'PACKAGE' as const, id: p.id, mrp: p.mrp, price: p.price })),
  ];

  const existingKeys = new Set(existing.map((cp) => `${cp.cityId}:${cp.itemType}:${cp.itemId}`));

  const toCreate: { cityId: string; itemType: (typeof items)[number]['itemType']; itemId: string; mrp: number; price: number }[] = [];
  for (const item of items) {
    for (const city of cities) {
      const key = `${city.id}:${item.itemType}:${item.id}`;
      if (existingKeys.has(key)) continue; // never overwrite a price an admin already set for this city
      toCreate.push({ cityId: city.id, itemType: item.itemType, itemId: item.id, mrp: item.mrp, price: item.price });
    }
  }

  if (toCreate.length > 0) {
    await prisma.cityPrice.createMany({ data: toCreate });
  }

  console.log(
    `Cities: ${cities.length}. Catalogue items: ${items.length} (${parameters.length} parameters, ${profiles.length} tests, ${packages.length} packages).`,
  );
  console.log(`Created ${toCreate.length} new city-price rows — ${existingKeys.size} existing row(s) left untouched.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
