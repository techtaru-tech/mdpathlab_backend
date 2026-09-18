#!/usr/bin/env node
// Idempotent demo-data seeder for the header mega-menu's category dropdowns — creates a handful
// of real Profile ("Test") rows per category so no dropdown pane (e.g. Full Body Checkup's
// "Blood Tests") is ever empty. Safe to re-run anywhere: every test is looked up by its unique
// testCode first and skipped if it already exists, so running this again (including against a
// different environment) never creates duplicates.
//
// Usage:
//   API_URL=http://localhost:3001 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-category-demo-tests.mjs
//
// Defaults: API_URL=http://localhost:3001, ADMIN_EMAIL/ADMIN_PASSWORD must be provided (no
// credentials are hardcoded here) — for production, point API_URL at the live API and pass the
// live admin's own credentials, e.g.:
//   API_URL=https://api.mdpathlab.techtaru.in ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-category-demo-tests.mjs

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.");
  process.exit(1);
}

// A handful of real, recognizable test names per category slug — enough for a 4-column preview
// grid without inventing more than a dropdown ever shows. testCode is prefixed "SEED-" so these
// are easy to find/remove later if the client wants to replace them with real catalogue data.
// The optional 4th element is a `tag` — Full Body Checkup's header dropdown buckets its tests by
// tag into separate sub-nav sections (Blood Tests, Tests by Health Risks, etc. — see
// CategoryMegaMenu.tsx's FullBodyCheckupPanel); every other category ignores it.
const TESTS_BY_CATEGORY = {
  "full-body-checkup": [
    ["CBC Test", "Complete Blood Count", 12, "blood-tests"],
    ["LFT (Liver Function Test)", "Liver enzyme and function panel", 24, "blood-tests"],
    ["KFT (Kidney Function Test)", "Kidney function panel", 24, "blood-tests"],
    ["Blood Sugar Fasting Test", "Fasting glucose level", 6, "blood-tests"],
    ["Vitamin D Test", "25-hydroxy vitamin D level", 24, "blood-tests"],
    ["Vitamin B12 Test", "Vitamin B12 level", 24, "blood-tests"],
    ["Urine Routine Test", "Routine urine examination", 6, "blood-tests"],
    ["Lipid Profile Test", "Cholesterol and triglycerides panel", 12, "blood-tests"],
    ["Smoking Health Risk Panel", "Screens for smoking-related lung and heart impact", 24, "unhealthy-habits"],
    ["Alcohol Liver Impact Panel", "Screens for alcohol-related liver impact", 24, "unhealthy-habits"],
    ["Sedentary Lifestyle Panel", "Screens for risks linked to a low-activity lifestyle", 24, "unhealthy-habits"],
    ["Junk Food Metabolic Panel", "Screens for diet-related metabolic risk", 24, "unhealthy-habits"],
    ["Heart Disease Risk Panel", "Screens for early heart disease risk factors", 24, "health-risks"],
    ["Diabetes Risk Panel", "Screens for early diabetes risk factors", 12, "health-risks"],
    ["Cancer Risk Screening Panel", "Screens for common cancer risk markers", 48, "health-risks"],
    ["Obesity & Metabolic Risk Panel", "Screens for obesity-linked metabolic risk", 24, "health-risks"],
    ["Pre-Employment Health Checkup", "Standard checkup for new-hire medical clearance", 24, "govt-panel"],
    ["Government Employee Health Panel", "Standard panel for government service medical records", 24, "govt-panel"],
    ["FSSAI Food Handler Medical Test", "Required medical test for food-handling personnel", 24, "govt-panel"],
    ["Driving License Medical Fitness Test", "Medical fitness test for driving license applications", 12, "govt-panel"],
  ],
  heart: [
    ["ECG Test", "Electrocardiogram heart rhythm check", 6],
    ["Troponin I Test", "Cardiac muscle damage marker", 12],
    ["CRP Test", "C-reactive protein, inflammation marker", 12],
    ["Lipid Profile Test", "Cholesterol and triglycerides panel", 12],
  ],
  cancer: [
    ["CA 125 Test", "Ovarian cancer marker", 24],
    ["PSA Test", "Prostate cancer marker", 24],
    ["CEA Tumor Marker Test", "Colorectal cancer marker", 24],
    ["AFP Test", "Liver cancer marker", 24],
  ],
  thyroid: [
    ["TSH Test", "Thyroid stimulating hormone level", 12],
    ["T3 T4 Test", "Thyroid hormone panel", 12],
    ["Anti-TPO Test", "Thyroid antibody test", 24],
  ],
  diabetes: [
    ["HbA1c Test", "3-month average blood sugar", 12],
    ["Fasting Blood Sugar Test", "Fasting glucose level", 6],
    ["Postprandial Blood Sugar Test", "Post-meal glucose level", 6],
    ["Insulin Test", "Fasting insulin level", 24],
  ],
  pregnancy: [
    ["Beta hCG Test", "Pregnancy hormone level", 12],
    ["TORCH Panel Test", "Infection screening in pregnancy", 24],
    ["Double Marker Test", "First-trimester screening", 48],
  ],
  "allergy-intolerance": [
    ["Allergy Panel Test", "Common allergen screening", 48],
    ["IgE Test", "Total immunoglobulin E level", 24],
    ["Food Intolerance Test", "Common food sensitivity screening", 48],
  ],
  hormone: [
    ["Testosterone Test", "Testosterone hormone level", 24],
    ["Cortisol Test", "Stress hormone level", 24],
    ["Prolactin Test", "Prolactin hormone level", 24],
  ],
  "dna-test": [
    ["Ancestry DNA Test", "Genetic ancestry screening", 168],
    ["Paternity DNA Test", "Biological parentage confirmation", 168],
    ["Genetic Disorder Screening", "Common inherited disorder screening", 168],
  ],
};

async function req(method, path, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return json;
}

function slugifyCode(categorySlug, name) {
  return `SEED-${categorySlug}-${name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// A name like "Lipid Profile Test" can legitimately appear under more than one category (e.g.
// Full Body Checkup and Heart) — the slug must stay unique across the whole catalogue, so it
// always carries the category too, even though the display name doesn't.
function slugifyUrl(categorySlug, name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${categorySlug}`;
}

async function main() {
  const login = await req("POST", "/admin/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token = login.accessToken ?? login.token;
  if (!token) throw new Error("Login did not return a token");

  const [categories, existingTests] = await Promise.all([
    req("GET", "/catalogue/categories", undefined, token),
    req("GET", "/admin/tests", undefined, token),
  ]);
  const existingByCode = new Map(existingTests.map((t) => [t.testCode, t]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const category of categories) {
    const plan = TESTS_BY_CATEGORY[category.slug];
    if (!plan) continue;

    for (const [name, shortDescription, reportTimeHours, tag] of plan) {
      const testCode = slugifyCode(category.slug, name);
      const existing = existingByCode.get(testCode);

      if (existing) {
        // Backfills `tag` onto rows created by an earlier run of this script, before tagging
        // existed — everything else about the row is left as an admin may have since edited it.
        if ((existing.tag ?? null) !== (tag ?? null)) {
          await req(
            "PATCH",
            `/admin/tests/${existing.id}`,
            {
              testCode: existing.testCode,
              name: existing.name,
              slug: existing.slug,
              categoryId: existing.categoryId,
              shortDescription: existing.shortDescription ?? undefined,
              mrp: existing.mrp,
              price: existing.price,
              sampleCollection: existing.sampleCollection,
              reportTimeHours: existing.reportTimeHours,
              status: existing.status,
              tag,
            },
            token,
          );
          updated++;
          console.log(`tagged: [${category.slug}] ${name} -> ${tag}`);
        } else {
          skipped++;
        }
        continue;
      }

      await req(
        "POST",
        "/admin/tests",
        {
          testCode,
          name,
          slug: slugifyUrl(category.slug, name),
          categoryId: category.id,
          shortDescription,
          mrp: 600,
          price: 349,
          sampleCollection: "HOME",
          reportTimeHours,
          status: "ACTIVE",
          tag,
        },
        token,
      );
      created++;
      console.log(`created: [${category.slug}] ${name}`);
    }
  }

  console.log(`\nDone. Created ${created}, tagged ${updated}, skipped ${skipped} (already up to date).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
