// One-off, idempotent data fix: links every test (Profile) to the parameters (markers) it reports, and
// fills the breakdown of the 8 original standalone tests, so test / package detail APIs never come back
// with empty parameter lists. Safe to re-run: existing markers/links are reused, nothing is deleted.
//
//   node scripts/link-test-parameters.cjs          (run from the project root, with .env present)
//
// Reference ranges are deliberately NOT set — they are lab/method specific and print on real reports.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const CBC = ['Hemoglobin', 'RBC Count', 'Hematocrit (PCV)', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD', 'Total Leucocyte Count (TLC)', 'Neutrophils (%)', 'Lymphocytes (%)', 'Monocytes (%)', 'Eosinophils (%)', 'Basophils (%)', 'Absolute Neutrophil Count', 'Absolute Lymphocyte Count', 'Absolute Monocyte Count', 'Absolute Eosinophil Count', 'Absolute Basophil Count', 'Platelet Count', 'MPV', 'PDW', 'PCT', 'P-LCR', 'P-LCC', 'Neutrophil-Lymphocyte Ratio (NLR)', 'Immature Granulocytes (%)', 'Immature Granulocytes (Absolute)'];
const LIPID = ['Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol', 'Non-HDL Cholesterol', 'Total Cholesterol / HDL Ratio', 'LDL / HDL Ratio', 'Triglyceride / HDL Ratio'];
const LFT = ['Total Bilirubin', 'Direct Bilirubin', 'Indirect Bilirubin', 'SGOT (AST)', 'SGPT (ALT)', 'Alkaline Phosphatase (ALP)', 'GGT', 'Total Protein', 'Albumin', 'Globulin', 'Albumin / Globulin Ratio', 'SGOT / SGPT Ratio'];
const KFT = ['Blood Urea', 'Blood Urea Nitrogen (BUN)', 'Serum Creatinine', 'Uric Acid', 'Calcium', 'Sodium', 'Potassium', 'Chloride', 'eGFR', 'BUN / Creatinine Ratio'];
const THYROID = ['Total T3', 'Total T4', 'TSH'];
const HBA1C = ['HbA1c', 'Estimated Average Glucose (eAG)'];
const URINE = ['Urine Colour', 'Urine Appearance', 'Urine Specific Gravity', 'Urine pH', 'Urine Protein', 'Urine Glucose', 'Urine Ketones', 'Urine Bilirubin', 'Urine Urobilinogen', 'Urine Blood', 'Urine Nitrite', 'Urine Leukocyte Esterase', 'Urine Pus Cells', 'Urine RBCs', 'Urine Epithelial Cells', 'Urine Casts', 'Urine Crystals'];

// Standalone tests (code = null): their breakdown is stored on the row itself. Lengths must match the
// admin-entered display counts (28 / 3 / 2 / 9 / 1 / 12 / 10 / 1) — checked below.
const STANDALONE = {
  'complete-blood-count-cbc': CBC,
  'thyroid-profile-total-t3-t4-tsh': THYROID,
  'hba1c-glycated-haemoglobin': HBA1C,
  'lipid-profile': LIPID,
  'vitamin-d-25-oh': ['25-OH Vitamin D'],
  'liver-function-test-lft': LFT,
  'kidney-function-test-kft': KFT,
  'vitamin-b12-serum': ['Vitamin B12'],
};

const PROFILES = {
  // --- Full body checkup: single tests
  'cbc-test-full-body-checkup': CBC,
  'lft-liver-function-test-full-body-checkup': LFT,
  'kft-kidney-function-test-full-body-checkup': KFT,
  'blood-sugar-fasting-test-full-body-checkup': ['Fasting Blood Glucose'],
  'vitamin-d-test-full-body-checkup': ['25-OH Vitamin D'],
  'vitamin-b12-test-full-body-checkup': ['Vitamin B12'],
  'urine-routine-test-full-body-checkup': URINE,
  'lipid-profile-test-full-body-checkup': LIPID,
  // --- Full body checkup: lifestyle / risk / medical panels (composed from standard markers; for lab review)
  'smoking-health-risk-panel-full-body-checkup': ['Hemoglobin', 'Total Leucocyte Count (TLC)', 'Platelet Count', 'Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'HbA1c', 'C-Reactive Protein (CRP)'],
  'alcohol-liver-impact-panel-full-body-checkup': ['SGOT (AST)', 'SGPT (ALT)', 'GGT', 'Alkaline Phosphatase (ALP)', 'Total Bilirubin', 'Albumin', 'Triglycerides', 'MCV', 'Uric Acid'],
  'sedentary-lifestyle-panel-full-body-checkup': ['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'Fasting Blood Glucose', 'HbA1c', '25-OH Vitamin D', 'Vitamin B12'],
  'junk-food-metabolic-panel-full-body-checkup': ['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'Fasting Blood Glucose', 'HbA1c', 'SGPT (ALT)', 'SGOT (AST)', 'Uric Acid'],
  'heart-disease-risk-panel-full-body-checkup': ['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol', 'Triglycerides', 'C-Reactive Protein (CRP)', 'HbA1c', 'Fasting Blood Glucose'],
  'diabetes-risk-panel-full-body-checkup': ['Fasting Blood Glucose', 'Post-Prandial Blood Glucose', 'HbA1c', 'Fasting Insulin', 'Triglycerides', 'HDL Cholesterol'],
  'cancer-risk-screening-panel-full-body-checkup': ['Hemoglobin', 'Total Leucocyte Count (TLC)', 'Platelet Count', 'AFP', 'CEA', 'CA 125', 'Total PSA'],
  'obesity-metabolic-risk-panel-full-body-checkup': ['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'Fasting Blood Glucose', 'HbA1c', 'TSH', '25-OH Vitamin D', 'SGPT (ALT)', 'Uric Acid'],
  'pre-employment-health-checkup-full-body-checkup': ['Hemoglobin', 'Total Leucocyte Count (TLC)', 'Platelet Count', 'ESR', 'Fasting Blood Glucose', 'Serum Creatinine', 'SGPT (ALT)', 'Urine Protein', 'Urine Glucose'],
  'government-employee-health-panel-full-body-checkup': ['Hemoglobin', 'Total Leucocyte Count (TLC)', 'Platelet Count', 'ESR', 'Fasting Blood Glucose', 'Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'Blood Urea', 'Serum Creatinine', 'SGOT (AST)', 'SGPT (ALT)', 'Urine Protein', 'Urine Glucose'],
  'fssai-food-handler-medical-test-full-body-checkup': ['Hemoglobin', 'Total Leucocyte Count (TLC)', 'Platelet Count', 'Widal Test (Typhoid)', 'Stool Routine Examination', 'Urine Protein', 'Urine Glucose'],
  'driving-license-medical-fitness-test-full-body-checkup': ['Hemoglobin', 'Fasting Blood Glucose', 'Urine Glucose', 'Urine Protein'],
  // --- Diabetes
  'hba1c-test-diabetes': HBA1C,
  'fasting-blood-sugar-test-diabetes': ['Fasting Blood Glucose'],
  'postprandial-blood-sugar-test-diabetes': ['Post-Prandial Blood Glucose'],
  'insulin-test-diabetes': ['Fasting Insulin'],
  // --- Thyroid
  'tsh-test-thyroid': ['TSH'],
  't3-t4-test-thyroid': ['Total T3', 'Total T4'],
  'anti-tpo-test-thyroid': ['Anti-TPO Antibodies'],
  // --- Heart
  'troponin-i-test-heart': ['Troponin I'],
  'lipid-profile-test-heart': LIPID,
  'crp-test-heart': ['C-Reactive Protein (CRP)'],
  'ecg-test-heart': ['Heart Rate', 'Rhythm', 'PR Interval', 'QRS Duration', 'QT / QTc Interval', 'Cardiac Axis'],
  // --- Hormone
  'testosterone-test-hormone': ['Total Testosterone'],
  'cortisol-test-hormone': ['Cortisol'],
  'prolactin-test-hormone': ['Prolactin'],
  // --- Pregnancy
  'beta-hcg-test-pregnancy': ['Beta hCG'],
  'double-marker-test-pregnancy': ['Free Beta hCG', 'PAPP-A'],
  'torch-panel-test-pregnancy': ['Toxoplasma IgG', 'Toxoplasma IgM', 'Rubella IgG', 'Rubella IgM', 'Cytomegalovirus (CMV) IgG', 'Cytomegalovirus (CMV) IgM', 'Herpes Simplex Virus (HSV) IgG', 'Herpes Simplex Virus (HSV) IgM'],
  // --- Cancer
  'ca-125-test-cancer': ['CA 125'],
  'psa-test-cancer': ['Total PSA'],
  'cea-tumor-marker-test-cancer': ['CEA'],
  'afp-test-cancer': ['AFP'],
  // --- Allergy
  'ige-test-allergy-intolerance': ['Total IgE'],
  'allergy-panel-test-allergy-intolerance': ['Total IgE', 'House Dust Mite IgE', 'Pollen IgE', 'Mould IgE', 'Animal Dander IgE', 'Milk IgE', 'Egg White IgE', 'Wheat IgE', 'Peanut IgE', 'Soy IgE'],
  'food-intolerance-test-allergy-intolerance': ['Milk IgG', 'Egg White IgG', 'Wheat IgG', 'Gluten IgG', 'Soy IgG', 'Peanut IgG', 'Tomato IgG', 'Almond IgG'],
  // --- DNA (report sections rather than blood markers)
  'ancestry-dna-test-dna-test': ['Ethnicity Estimate', 'Maternal Haplogroup', 'Paternal Haplogroup'],
  'paternity-dna-test-dna-test': ['STR Loci Comparison', 'Paternity Index', 'Probability of Paternity'],
  'genetic-disorder-screening-dna-test': ['Carrier Screening Panel Result'],
};

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

(async () => {
  // Sanity: component lists must agree with the display counts the admin already entered.
  const standalone = await p.parameter.findMany({ where: { code: null, slug: { in: Object.keys(STANDALONE) } } });
  for (const row of standalone) {
    const want = STANDALONE[row.slug].length;
    if (row.displayParameterCount !== null && row.displayParameterCount !== want) {
      throw new Error(`${row.slug}: display count ${row.displayParameterCount} != ${want} components`);
    }
  }

  // 1. Marker rows (atomic parameters carry a code, which keeps them out of the bookable test list).
  const names = [...new Set(Object.values(PROFILES).flat())];
  const slugs = new Map();
  for (const n of names) {
    const s = 'marker-' + slugify(n);
    if (slugs.has(s)) throw new Error(`slug clash: "${n}" and "${slugs.get(s)}"`);
    slugs.set(s, n);
  }
  const idByName = new Map();
  let created = 0;
  for (const n of names) {
    const code = 'MK-' + slugify(n).toUpperCase();
    const slug = 'marker-' + slugify(n);
    const existing = await p.parameter.findUnique({ where: { code } });
    if (existing) { idByName.set(n, existing.id); continue; }
    const row = await p.parameter.create({ data: { name: n, slug, code, mrp: 0, price: 0, reportTimeHours: 24, sampleCollection: 'HOME', status: 'ACTIVE' } });
    idByName.set(n, row.id);
    created++;
  }

  // 2. Link each test to its markers.
  let linked = 0, missingProfiles = [];
  for (const [slug, comps] of Object.entries(PROFILES)) {
    const profile = await p.profile.findUnique({ where: { slug } });
    if (!profile) { missingProfiles.push(slug); continue; }
    const res = await p.profileParameter.createMany({ data: comps.map((n) => ({ profileId: profile.id, parameterId: idByName.get(n) })), skipDuplicates: true });
    linked += res.count;
  }

  // 3. Breakdown for the standalone tests.
  for (const [slug, comps] of Object.entries(STANDALONE)) {
    await p.parameter.updateMany({ where: { slug, code: null }, data: { componentNames: comps } });
  }

  const [profilesTotal, withLinks, standaloneFilled] = await Promise.all([
    p.profile.count(),
    p.profile.count({ where: { parameters: { some: {} } } }),
    p.parameter.count({ where: { code: null, NOT: { componentNames: { isEmpty: true } } } }),
  ]);
  console.log(JSON.stringify({ markersCreated: created, markersTotal: names.length, linksCreated: linked, missingProfiles, profilesWithParameters: `${withLinks}/${profilesTotal}`, standaloneTestsWithBreakdown: standaloneFilled }));
  await p.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
