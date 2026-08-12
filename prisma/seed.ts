// Interim seed — mirrors the 8 tests / 4 packages currently hardcoded in the frontend's
// src/data/site.ts mock data, so the API isn't empty while the client's real Test/Package
// Master CSV is still "preparing" (see the development plan's open items).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Matches the frontend's slugify exactly (src/data/site.ts) so slugs stay stable when this
// interim data is eventually replaced by the real catalogue import.
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const reportHoursFrom = (reportsIn: string): number => {
  if (/same day/i.test(reportsIn)) return 6;
  const hours = reportsIn.match(/(\d+)/)?.[1];
  return hours ? Number(hours) : 24;
};

const fastingFrom = (fasting: string): { fastingRequired: boolean; fastingHours: number | null } => {
  if (/not required/i.test(fasting)) return { fastingRequired: false, fastingHours: null };
  const hours = fasting.match(/(\d+)/)?.[1];
  return { fastingRequired: true, fastingHours: hours ? Number(hours) : null };
};

const tests = [
  { name: 'Complete Blood Count (CBC)', parameters: 28, price: 299, mrp: 650, reportsIn: 'Same day', fasting: 'Not required', tag: 'Most booked' },
  { name: 'Thyroid Profile Total (T3, T4, TSH)', parameters: 3, price: 399, mrp: 900, reportsIn: 'Same day', fasting: 'Not required' },
  { name: 'HbA1c (Glycated Haemoglobin)', parameters: 2, price: 449, mrp: 990, reportsIn: '24 hours', fasting: 'Not required', tag: 'Diabetes' },
  { name: 'Lipid Profile', parameters: 9, price: 449, mrp: 1100, reportsIn: 'Same day', fasting: '10-12 hours' },
  { name: 'Vitamin D (25-OH)', parameters: 1, price: 899, mrp: 1900, reportsIn: '24 hours', fasting: 'Not required', tag: 'Trending' },
  { name: 'Liver Function Test (LFT)', parameters: 12, price: 549, mrp: 1250, reportsIn: 'Same day', fasting: '8 hours' },
  { name: 'Kidney Function Test (KFT)', parameters: 10, price: 599, mrp: 1300, reportsIn: 'Same day', fasting: '8 hours' },
  { name: 'Vitamin B12 Serum', parameters: 1, price: 649, mrp: 1400, reportsIn: '24 hours', fasting: 'Not required' },
];

const packages = [
  {
    name: 'MD Path Lab Essential Health Checkup',
    subtitle: 'A yearly baseline for healthy adults',
    parameters: 62,
    price: 899,
    mrp: 2400,
    reportsIn: 'Within 12 hours',
    bestFor: 'Age 18-35',
    highlights: ['CBC + ESR', 'Lipid & Liver profile', 'Thyroid (TSH)', 'Blood sugar fasting'],
    badge: 'Starter',
  },
  {
    name: 'MD Path Lab Advanced Full Body',
    subtitle: 'Our most comprehensive preventive screening',
    parameters: 94,
    price: 1599,
    mrp: 4600,
    reportsIn: 'Within 12 hours',
    bestFor: 'Age 30-55',
    highlights: [
      'Complete Thyroid + Vitamin D & B12',
      'Diabetes HbA1c panel',
      'Iron studies & Electrolytes',
      'Free doctor tele-consultation',
    ],
    badge: 'Most popular',
    isFeatured: true,
  },
  {
    name: "MD Path Lab Women's Wellness",
    subtitle: 'Hormone, bone and anaemia focused',
    parameters: 78,
    price: 1399,
    mrp: 3900,
    reportsIn: 'Within 24 hours',
    bestFor: 'Women 25+',
    highlights: ['PCOS hormone panel', 'Calcium & Vitamin D', 'Iron deficiency profile', 'Thyroid antibodies'],
    badge: 'For her',
  },
  {
    name: 'MD Path Lab Senior Citizen Care',
    subtitle: 'Heart, kidney and bone health, tracked',
    parameters: 88,
    price: 1899,
    mrp: 5200,
    reportsIn: 'Within 24 hours',
    bestFor: 'Age 60+',
    highlights: ['Cardiac risk markers', 'Complete KFT & LFT', 'Arthritis panel', 'Home ECG add-on available'],
    badge: 'Care+',
  },
];

async function main() {
  for (const t of tests) {
    const { fastingRequired, fastingHours } = fastingFrom(t.fasting);
    const data = {
      name: t.name,
      mrp: t.mrp,
      price: t.price,
      reportTimeHours: reportHoursFrom(t.reportsIn),
      fastingRequired,
      fastingHours,
      tag: t.tag ?? null,
      displayParameterCount: t.parameters,
    };
    await prisma.parameter.upsert({
      where: { slug: slugify(t.name) },
      update: data,
      create: { ...data, slug: slugify(t.name) },
    });
  }

  for (const p of packages) {
    const data = {
      name: p.name,
      subtitle: p.subtitle,
      mrp: p.mrp,
      price: p.price,
      reportTimeHours: reportHoursFrom(p.reportsIn),
      bestFor: p.bestFor,
      badge: p.badge,
      highlights: p.highlights,
      isFeatured: p.isFeatured ?? false,
      displayParameterCount: p.parameters,
    };
    await prisma.package.upsert({
      where: { slug: slugify(p.name) },
      update: data,
      create: { ...data, slug: slugify(p.name) },
    });
  }

  // Hourly slots, 7 AM to 10 PM — matches the client's stated collection window in the RGF.
  const to12h = (hour24: number) => {
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${String(hour12).padStart(2, '0')}:00 ${period}`;
  };
  const slots = Array.from({ length: 15 }, (_, i) => {
    const startHour = 7 + i;
    const endHour = startHour + 1;
    return {
      label: `${to12h(startHour)} - ${to12h(endHour)}`,
      startTime: `${String(startHour).padStart(2, '0')}:00`,
      endTime: `${String(endHour).padStart(2, '0')}:00`,
      sortOrder: i,
    };
  });

  for (const s of slots) {
    const existing = await prisma.slot.findFirst({ where: { startTime: s.startTime, endTime: s.endTime } });
    if (!existing) {
      await prisma.slot.create({ data: s });
    }
  }

  // Sample coupon for testing the checkout discount path — not client-provided data.
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', type: 'PERCENT', value: 10, maxDiscount: 200, minOrderValue: 200 },
  });

  // First admin login — see .env's SEED_ADMIN_EMAIL/PASSWORD comment for the hand-off note.
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@mdpathlabs.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 10), name: 'Admin' },
  });

  console.log(
    `Seeded ${tests.length} parameters, ${packages.length} packages, ${slots.length} slots, 1 coupon and 1 admin (${adminEmail}).`,
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
