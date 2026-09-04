// One-off data-population script: realistic Tests (Profile), their atomic Parameter marker
// components, and Package -> included-test links. Run once via `npx tsx prisma/seed-tests-packages.ts`.
// Pricing here is placeholder (explicitly OK'd — real pricing to be swapped in later); names,
// sample types and marker breakdowns are meant to read as real on the storefront.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const categories = [
  'Full Body Checkup',
  'Diabetes Care',
  'Heart Health',
  'Thyroid Care',
  'Vitamins & Minerals',
  'Liver & Kidney Health',
  "Women's Health",
  'Blood & Immunity',
];

// Atomic markers — always carry a `code`, so CatalogueService.listTests() never surfaces them as
// standalone bookable tests (that filter only excludes coded Parameter rows).
const markers = [
  { code: 'HB', name: 'Haemoglobin', category: 'Blood & Immunity' },
  { code: 'RBC', name: 'Total RBC Count', category: 'Blood & Immunity' },
  { code: 'WBC', name: 'Total WBC Count', category: 'Blood & Immunity' },
  { code: 'PLT', name: 'Platelet Count', category: 'Blood & Immunity' },
  { code: 'ESR', name: 'ESR', category: 'Blood & Immunity' },
  { code: 'CHOL-T', name: 'Total Cholesterol', category: 'Heart Health' },
  { code: 'CHOL-HDL', name: 'HDL Cholesterol', category: 'Heart Health' },
  { code: 'CHOL-LDL', name: 'LDL Cholesterol', category: 'Heart Health' },
  { code: 'TRIG', name: 'Triglycerides', category: 'Heart Health' },
  { code: 'TSH', name: 'TSH', category: 'Thyroid Care' },
  { code: 'FT3', name: 'Free T3', category: 'Thyroid Care' },
  { code: 'FT4', name: 'Free T4', category: 'Thyroid Care' },
  { code: 'GLU-F', name: 'Fasting Blood Glucose', category: 'Diabetes Care' },
  { code: 'HBA1C', name: 'HbA1c', category: 'Diabetes Care' },
  { code: 'SGPT', name: 'SGPT (ALT)', category: 'Liver & Kidney Health' },
  { code: 'SGOT', name: 'SGOT (AST)', category: 'Liver & Kidney Health' },
  { code: 'BILI-T', name: 'Total Bilirubin', category: 'Liver & Kidney Health' },
  { code: 'UREA', name: 'Blood Urea', category: 'Liver & Kidney Health' },
  { code: 'CREAT', name: 'Serum Creatinine', category: 'Liver & Kidney Health' },
  { code: 'URIC', name: 'Uric Acid', category: 'Liver & Kidney Health' },
  { code: 'VITD', name: 'Vitamin D3 (25-OH)', category: 'Vitamins & Minerals' },
  { code: 'VITB12', name: 'Vitamin B12', category: 'Vitamins & Minerals' },
  { code: 'CALC', name: 'Serum Calcium', category: 'Vitamins & Minerals' },
  { code: 'FERR', name: 'Serum Ferritin', category: 'Vitamins & Minerals' },
];

// Deliberately excludes CBC/Lipid/Thyroid/HbA1c/LFT/KFT/Vitamin D/Vitamin B12 — those already
// exist as the 8 legacy Parameter-table tests (see prisma/schema.prisma's Parameter comment,
// which forbids migrating or deactivating them). Re-adding them as Profiles here would collide
// on name+slug and list the same test twice on the storefront. Only genuinely new tests go here;
// the legacy 8 get real package links below via their existing Parameter ids instead.
const tests = [
  {
    testCode: 'GLU101', name: 'Fasting Blood Sugar', category: 'Diabetes Care',
    sampleType: 'Blood (Fluoride)', prep: '8 hours fasting required',
    mrp: 200, price: 99, reportTimeHours: 6, fastingRequired: true, fastingHours: 8,
    params: ['GLU-F'],
  },
  {
    testCode: 'IRN101', name: 'Iron Deficiency Profile', category: "Women's Health",
    sampleType: 'Blood (EDTA + Serum)', prep: 'No special preparation needed',
    mrp: 1600, price: 799, reportTimeHours: 24, fastingRequired: false,
    params: ['FERR', 'HB'],
  },
  {
    testCode: 'BON101', name: 'Calcium & Bone Health Panel', category: 'Vitamins & Minerals',
    sampleType: 'Blood (Serum)', prep: 'No special preparation needed',
    mrp: 1300, price: 599, reportTimeHours: 24, fastingRequired: false,
    params: ['CALC', 'VITD'],
  },
  {
    testCode: 'CRD101', name: 'Cardiac Risk Marker Panel', category: 'Heart Health',
    sampleType: 'Blood (Serum)', prep: '10-12 hours fasting required',
    mrp: 2200, price: 999, reportTimeHours: 24, fastingRequired: true, fastingHours: 12,
    params: ['CHOL-T', 'CHOL-HDL', 'CHOL-LDL', 'TRIG', 'GLU-F'],
  },
];

// Legacy Parameter-table tests, referenced by slug (never re-created as Profiles — see note above).
const legacySlugs = {
  CBC: 'complete-blood-count-cbc',
  THYROID: 'thyroid-profile-total-t3-t4-tsh',
  HBA1C: 'hba1c-glycated-haemoglobin',
  LIPID: 'lipid-profile',
  VITD: 'vitamin-d-25-oh',
  LFT: 'liver-function-test-lft',
  KFT: 'kidney-function-test-kft',
  VITB12: 'vitamin-b12-serum',
} as const;

// Existing package slug -> included items, each either a legacy Parameter (by slug) or a new
// Profile test (by testCode).
const packageLinks: Record<string, { type: 'PARAMETER' | 'PROFILE'; ref: string }[]> = {
  'md-path-lab-essential-health-checkup': [
    { type: 'PARAMETER', ref: legacySlugs.CBC },
    { type: 'PARAMETER', ref: legacySlugs.LIPID },
    { type: 'PARAMETER', ref: legacySlugs.LFT },
    { type: 'PARAMETER', ref: legacySlugs.THYROID },
    { type: 'PROFILE', ref: 'GLU101' },
  ],
  'md-path-lab-advanced-full-body': [
    { type: 'PARAMETER', ref: legacySlugs.CBC },
    { type: 'PARAMETER', ref: legacySlugs.LIPID },
    { type: 'PARAMETER', ref: legacySlugs.LFT },
    { type: 'PARAMETER', ref: legacySlugs.KFT },
    { type: 'PARAMETER', ref: legacySlugs.THYROID },
    { type: 'PARAMETER', ref: legacySlugs.VITD },
    { type: 'PARAMETER', ref: legacySlugs.VITB12 },
    { type: 'PARAMETER', ref: legacySlugs.HBA1C },
    { type: 'PROFILE', ref: 'IRN101' },
    { type: 'PROFILE', ref: 'CRD101' },
  ],
  "md-path-lab-women-s-wellness": [
    { type: 'PARAMETER', ref: legacySlugs.THYROID },
    { type: 'PARAMETER', ref: legacySlugs.VITD },
    { type: 'PARAMETER', ref: legacySlugs.CBC },
    { type: 'PROFILE', ref: 'BON101' },
    { type: 'PROFILE', ref: 'IRN101' },
  ],
  'md-path-lab-senior-citizen-care': [
    { type: 'PARAMETER', ref: legacySlugs.KFT },
    { type: 'PARAMETER', ref: legacySlugs.LFT },
    { type: 'PARAMETER', ref: legacySlugs.VITD },
    { type: 'PARAMETER', ref: legacySlugs.VITB12 },
    { type: 'PROFILE', ref: 'CRD101' },
    { type: 'PROFILE', ref: 'BON101' },
  ],
};

async function main() {
  const categoryIdByName = new Map<string, string>();
  for (const name of categories) {
    const row = await prisma.category.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
    categoryIdByName.set(name, row.id);
  }

  const markerIdByCode = new Map<string, string>();
  for (const m of markers) {
    const row = await prisma.parameter.upsert({
      where: { code: m.code },
      update: { name: m.name, categoryId: categoryIdByName.get(m.category) },
      create: {
        code: m.code,
        name: m.name,
        slug: slugify(m.name),
        categoryId: categoryIdByName.get(m.category),
        mrp: 150,
        price: 100,
        reportTimeHours: 24,
      },
    });
    markerIdByCode.set(m.code, row.id);
  }

  const profileIdByTestCode = new Map<string, string>();
  for (const t of tests) {
    const parameterIds = t.params.map((code) => markerIdByCode.get(code)!);
    const data = {
      name: t.name,
      categoryId: categoryIdByName.get(t.category),
      sampleType: t.sampleType,
      preparationInstructions: t.prep,
      mrp: t.mrp,
      price: t.price,
      reportTimeHours: t.reportTimeHours,
      fastingRequired: t.fastingRequired,
      fastingHours: t.fastingRequired ? (t.fastingHours ?? null) : null,
    };
    const existing = await prisma.profile.findUnique({ where: { testCode: t.testCode } });
    const row = existing
      ? await prisma.profile.update({
          where: { testCode: t.testCode },
          data: { ...data, parameters: { deleteMany: {}, create: parameterIds.map((parameterId) => ({ parameterId })) } },
        })
      : await prisma.profile.create({
          data: { ...data, testCode: t.testCode, slug: slugify(t.name), parameters: { create: parameterIds.map((parameterId) => ({ parameterId })) } },
        });
    profileIdByTestCode.set(t.testCode, row.id);
  }

  for (const [slug, links] of Object.entries(packageLinks)) {
    const pkg = await prisma.package.findUnique({ where: { slug } });
    if (!pkg) {
      console.warn(`Package "${slug}" not found — skipping item links`);
      continue;
    }
    const items = await Promise.all(
      links.map(async (link) => {
        if (link.type === 'PROFILE') {
          return { itemType: 'PROFILE' as const, profileId: profileIdByTestCode.get(link.ref)!, parameterId: null };
        }
        const param = await prisma.parameter.findUnique({ where: { slug: link.ref } });
        if (!param) throw new Error(`Legacy parameter "${link.ref}" not found`);
        return { itemType: 'PARAMETER' as const, parameterId: param.id, profileId: null };
      }),
    );
    await prisma.packageItem.deleteMany({ where: { packageId: pkg.id } });
    await prisma.packageItem.createMany({ data: items.map((item) => ({ packageId: pkg.id, ...item })) });
  }

  console.log(
    `Seeded ${categories.length} categories, ${markers.length} atomic markers, ${tests.length} tests, and item links for ${Object.keys(packageLinks).length} packages.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
