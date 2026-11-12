// The five "MD CARE" full body checkup packages from the client's sheet (FULL BODY CHECKUP 5
// PACAKAGE.xlsx, shared on Slack 2026-11-12) — names, prices, MRPs, report time and included tests
// exactly as the sheet lists them. Idempotent: a package or test that already exists (by slug /
// testCode) is left exactly as it is, so re-running never duplicates anything or overwrites an
// admin's later edits.
//
// Tests the sheet includes that the catalogue already sells are linked to those existing rows. The
// five it doesn't have yet (Calcium, eGFR, ESR, Iron Profile, RA Factor) are created INACTIVE at ₹0:
// they show in the packages' "tests included" list but can't be booked on their own until admin
// sets a real price and switches them on.
//
// Usage: npx tsx scripts/seed-md-care-packages.ts
import 'dotenv/config';
import { PrismaClient, type PackageItemType } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

type Ref = { itemType: PackageItemType; parameterSlug?: string; testCode?: string };

const NEW_TESTS: Record<string, { testCode: string; name: string; sampleType: string; reportTimeHours: number }> = {
  calcium: { testCode: 'MDC-CALCIUM-SERUM', name: 'Calcium-Serum', sampleType: 'Blood', reportTimeHours: 24 },
  egfr: { testCode: 'MDC-EGFR', name: 'EGFR (Estimated Glomerular Filtration Rate)', sampleType: 'Blood', reportTimeHours: 24 },
  esr: { testCode: 'MDC-ESR', name: 'ESR (Erythrocyte Sedimentation Rate)', sampleType: 'Blood', reportTimeHours: 24 },
  iron: { testCode: 'MDC-IRON-PROFILE-BASIC', name: 'Iron Profile Basic', sampleType: 'Blood', reportTimeHours: 24 },
  ra: { testCode: 'MDC-RA-FACTOR-QUANT', name: 'Rheumatoid Factor (RA Factor) - Quantitative', sampleType: 'Blood', reportTimeHours: 24 },
};

const TESTS: Record<string, Ref> = {
  cbc: { itemType: 'PARAMETER', parameterSlug: 'complete-blood-count-cbc' },
  kft: { itemType: 'PARAMETER', parameterSlug: 'kidney-function-test-kft' },
  lipid: { itemType: 'PARAMETER', parameterSlug: 'lipid-profile' },
  lft: { itemType: 'PARAMETER', parameterSlug: 'liver-function-test-lft' },
  thyroid: { itemType: 'PARAMETER', parameterSlug: 'thyroid-profile-total-t3-t4-tsh' },
  hba1c: { itemType: 'PARAMETER', parameterSlug: 'hba1c-glycated-haemoglobin' },
  vitd: { itemType: 'PARAMETER', parameterSlug: 'vitamin-d-25-oh' },
  b12: { itemType: 'PARAMETER', parameterSlug: 'vitamin-b12-serum' },
  glucose: { itemType: 'PROFILE', testCode: 'SEED-DIABETES-FASTING-BLOOD-SUGAR-TEST' },
  urine: { itemType: 'PROFILE', testCode: 'SEED-FULL-BODY-CHECKUP-URINE-ROUTINE-TES' },
  crp: { itemType: 'PROFILE', testCode: 'SEED-HEART-CRP-TEST' },
  testosterone: { itemType: 'PROFILE', testCode: 'SEED-HORMONE-TESTOSTERONE-TEST' },
  psa: { itemType: 'PROFILE', testCode: 'SEED-CANCER-PSA-TEST' },
  ...Object.fromEntries(Object.entries(NEW_TESTS).map(([key, t]) => [key, { itemType: 'PROFILE' as const, testCode: t.testCode }])),
};

// In the sheet's own order. Every package has fasting blood glucose, hence fasting on all of them.
const PACKAGES = [
  { name: 'MD CARE 0.1 MD Basic Care', price: 599, mrp: 1500, tests: ['glucose', 'calcium', 'cbc', 'kft', 'lipid', 'lft', 'thyroid'] },
  {
    name: 'MD CARE 01 MD Advance Care',
    price: 1200,
    mrp: 2500,
    tests: ['calcium', 'egfr', 'hba1c', 'cbc', 'esr', 'iron', 'kft', 'lipid', 'lft', 'thyroid', 'urine', 'glucose'],
  },
  {
    name: 'MD CARE 02 MD Complete Care',
    price: 2000,
    mrp: 4200,
    tests: ['glucose', 'calcium', 'egfr', 'testosterone', 'b12', 'vitd', 'hba1c', 'cbc', 'esr', 'iron', 'kft', 'lipid', 'lft', 'thyroid', 'urine'],
  },
  {
    name: 'MD CARE 03 MD Premium Care',
    price: 3800,
    mrp: 7000,
    tests: ['lipid', 'cbc', 'esr', 'hba1c', 'iron', 'ra', 'crp', 'kft', 'egfr', 'lft', 'b12', 'vitd', 'thyroid', 'calcium', 'glucose', 'urine'],
  },
  {
    name: 'MD CARE 04 MD Executive Care',
    price: 4200,
    mrp: 8500,
    tests: ['glucose', 'calcium', 'egfr', 'psa', 'b12', 'crp', 'vitd', 'ra', 'hba1c', 'cbc', 'esr', 'iron', 'kft', 'lipid', 'lft', 'thyroid', 'urine'],
  },
];

async function main() {
  const category = await prisma.category.findUnique({ where: { slug: 'full-body-checkup' } });
  if (!category) throw new Error('Category "full-body-checkup" not found');

  let testsCreated = 0;
  for (const t of Object.values(NEW_TESTS)) {
    if (await prisma.profile.findUnique({ where: { testCode: t.testCode } })) continue;
    await prisma.profile.create({
      data: { ...t, slug: slugify(t.name), mrp: 0, price: 0, categoryId: category.id, status: 'INACTIVE' },
    });
    testsCreated++;
  }

  // Resolve every test key to its row up front, so a missing one stops the script before any package is written.
  const ids = new Map<string, string>();
  for (const [key, ref] of Object.entries(TESTS)) {
    const row = ref.parameterSlug
      ? await prisma.parameter.findUnique({ where: { slug: ref.parameterSlug } })
      : await prisma.profile.findUnique({ where: { testCode: ref.testCode! } });
    if (!row) throw new Error(`Test "${key}" (${ref.parameterSlug ?? ref.testCode}) not found`);
    ids.set(key, row.id);
  }

  const cities = await prisma.city.findMany({ select: { id: true } });
  let packagesCreated = 0;
  for (const p of PACKAGES) {
    const slug = slugify(p.name);
    if (await prisma.package.findUnique({ where: { slug } })) {
      console.log(`exists  ${p.name}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: {
          name: p.name,
          slug,
          subtitle: `Full body checkup — ${p.tests.length} tests`,
          price: p.price,
          mrp: p.mrp,
          reportTimeHours: 24,
          fastingRequired: true,
          fastingHours: 10,
          displayParameterCount: p.tests.length,
          categoryId: category.id,
          items: {
            create: p.tests.map((key) => {
              const ref = TESTS[key]!;
              return { itemType: ref.itemType, parameterId: ref.itemType === 'PARAMETER' ? ids.get(key)! : null, profileId: ref.itemType === 'PROFILE' ? ids.get(key)! : null };
            }),
          },
        },
      });
      // A package with no CityPrice row for a city is hidden there, so give every city the sheet's price.
      if (cities.length) {
        await tx.cityPrice.createMany({
          data: cities.map((c) => ({ cityId: c.id, itemType: 'PACKAGE' as const, itemId: pkg.id, mrp: p.mrp, price: p.price })),
          skipDuplicates: true,
        });
      }
    });
    packagesCreated++;
    console.log(`created ${p.name} — ₹${p.price} (MRP ₹${p.mrp}), ${p.tests.length} tests`);
  }

  console.log(`New hidden tests: ${testsCreated}. New packages: ${packagesCreated}. Cities priced: ${cities.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
