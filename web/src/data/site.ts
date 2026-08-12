export type Test = {
  name: string;
  parameters: number;
  price: number;
  mrp: number;
  reportsIn: string;
  fasting: string;
  tag?: string;
};

export const popularTests: Test[] = [
  {
    name: "Complete Blood Count (CBC)",
    parameters: 28,
    price: 299,
    mrp: 650,
    reportsIn: "Same day",
    fasting: "Not required",
    tag: "Most booked",
  },
  {
    name: "Thyroid Profile Total (T3, T4, TSH)",
    parameters: 3,
    price: 399,
    mrp: 900,
    reportsIn: "Same day",
    fasting: "Not required",
  },
  {
    name: "HbA1c (Glycated Haemoglobin)",
    parameters: 2,
    price: 449,
    mrp: 990,
    reportsIn: "24 hours",
    fasting: "Not required",
    tag: "Diabetes",
  },
  {
    name: "Lipid Profile",
    parameters: 9,
    price: 449,
    mrp: 1100,
    reportsIn: "Same day",
    fasting: "10-12 hours",
  },
  {
    name: "Vitamin D (25-OH)",
    parameters: 1,
    price: 899,
    mrp: 1900,
    reportsIn: "24 hours",
    fasting: "Not required",
    tag: "Trending",
  },
  {
    name: "Liver Function Test (LFT)",
    parameters: 12,
    price: 549,
    mrp: 1250,
    reportsIn: "Same day",
    fasting: "8 hours",
  },
  {
    name: "Kidney Function Test (KFT)",
    parameters: 10,
    price: 599,
    mrp: 1300,
    reportsIn: "Same day",
    fasting: "8 hours",
  },
  {
    name: "Vitamin B12 Serum",
    parameters: 1,
    price: 649,
    mrp: 1400,
    reportsIn: "24 hours",
    fasting: "Not required",
  },
];

export type Pkg = {
  name: string;
  subtitle: string;
  parameters: number;
  price: number;
  mrp: number;
  reportsIn: string;
  bestFor: string;
  highlights: string[];
  badge?: string;
  featured?: boolean;
};

export const packages: Pkg[] = [
  {
    name: "MD Path Lab Essential Health Checkup",
    subtitle: "A yearly baseline for healthy adults",
    parameters: 62,
    price: 899,
    mrp: 2400,
    reportsIn: "Within 12 hours",
    bestFor: "Age 18-35",
    highlights: ["CBC + ESR", "Lipid & Liver profile", "Thyroid (TSH)", "Blood sugar fasting"],
    badge: "Starter",
  },
  {
    name: "MD Path Lab Advanced Full Body",
    subtitle: "Our most comprehensive preventive screening",
    parameters: 94,
    price: 1599,
    mrp: 4600,
    reportsIn: "Within 12 hours",
    bestFor: "Age 30-55",
    highlights: [
      "Complete Thyroid + Vitamin D & B12",
      "Diabetes HbA1c panel",
      "Iron studies & Electrolytes",
      "Free doctor tele-consultation",
    ],
    badge: "Most popular",
    featured: true,
  },
  {
    name: "MD Path Lab Women's Wellness",
    subtitle: "Hormone, bone and anaemia focused",
    parameters: 78,
    price: 1399,
    mrp: 3900,
    reportsIn: "Within 24 hours",
    bestFor: "Women 25+",
    highlights: ["PCOS hormone panel", "Calcium & Vitamin D", "Iron deficiency profile", "Thyroid antibodies"],
    badge: "For her",
  },
  {
    name: "MD Path Lab Senior Citizen Care",
    subtitle: "Heart, kidney and bone health, tracked",
    parameters: 88,
    price: 1899,
    mrp: 5200,
    reportsIn: "Within 24 hours",
    bestFor: "Age 60+",
    highlights: ["Cardiac risk markers", "Complete KFT & LFT", "Arthritis panel", "Home ECG add-on available"],
    badge: "Care+",
  },
];

export const healthConcerns = [
  { name: "Diabetes", tests: 26, hue: "primary" },
  { name: "Heart Health", tests: 18, hue: "secondary" },
  { name: "Thyroid", tests: 12, hue: "accent" },
  { name: "Kidney", tests: 15, hue: "primary" },
  { name: "Liver", tests: 14, hue: "secondary" },
  { name: "Bone & Joint", tests: 11, hue: "accent" },
  { name: "Fever & Infection", tests: 21, hue: "primary" },
  { name: "Women's Health", tests: 24, hue: "secondary" },
];

export const reviews = [
  {
    name: "Ananya Sharma",
    city: "Gurugram",
    rating: 5,
    text: "The phlebotomist arrived 5 minutes before the slot, was extremely gentle and carried a sealed kit. Reports for my full body checkup landed on WhatsApp by 6 pm the same day.",
    package: "Advanced Full Body",
  },
  {
    name: "Rajesh Iyer",
    city: "Bengaluru",
    rating: 5,
    text: "I compare my HbA1c every quarter. The app trend chart is genuinely useful and the free doctor call helped me adjust my diet without another clinic visit.",
    package: "Diabetes Care Panel",
  },
  {
    name: "Meenakshi Nair",
    city: "Kochi",
    rating: 5,
    text: "Booked the senior citizen package for my father. Everything from slot confirmation to the collection was handled without a single follow-up call from our side.",
    package: "Senior Citizen Care",
  },
  {
    name: "Devansh Kapoor",
    city: "Lucknow",
    rating: 4,
    text: "Pricing is far more transparent than the lab near my house — no surprise charges at collection. Reports were NABL stamped and my doctor accepted them instantly.",
    package: "Essential Health Checkup",
  },
  {
    name: "Priya Deshmukh",
    city: "Pune",
    rating: 5,
    text: "The women's wellness panel picked up a Vitamin D deficiency I had ignored for years. Detailed report explanation in simple language was the best part.",
    package: "Women's Wellness",
  },
  {
    name: "Sarthak Bose",
    city: "Kolkata",
    rating: 5,
    text: "Slot at 6:30 am so I could fast comfortably and still reach office on time. Sample tracking updates at every stage felt very reassuring.",
    package: "Lipid & Liver Profile",
  },
];

export const faqs = [
  {
    q: "Is home sample collection really free?",
    a: "Yes. Home collection is free on every booking above ₹399 across all our service cities. Our certified phlebotomist arrives with a sealed, single-use collection kit at your chosen slot — there are no visit charges, no fuel charges and no hidden fees at the doorstep.",
  },
  {
    q: "Are your labs NABL accredited?",
    a: "All MD Path Lab processing laboratories are NABL accredited (ISO 15189:2022) and our flagship reference lab in Gurugram holds CAP accreditation. Every report carries the accreditation stamp and the signature of an MD Pathologist.",
  },
  {
    q: "How soon will I receive my reports?",
    a: "Most routine tests such as CBC, Lipid Profile and Thyroid are reported the same day by 8 pm. Specialised tests including Vitamin D, B12 and hormone assays are delivered within 24 hours. You get reports on WhatsApp, email and in the MD Path Lab app.",
  },
  {
    q: "Do I need to fast before my test?",
    a: "Fasting is required only for specific tests — Lipid Profile, Fasting Blood Sugar and most full body packages need 10-12 hours of overnight fasting. Water is allowed. Each test page and your booking confirmation clearly states the fasting requirement.",
  },
  {
    q: "Can I book a test for my parents in another city?",
    a: "Absolutely. During booking you can add a family member profile and enter their address. We serve 1,000+ cities, and the appointment updates and final reports can be sent to both your number and theirs.",
  },
  {
    q: "How is my health data protected?",
    a: "Reports are stored encrypted at rest and in transit, access is protected by OTP-based login, and data is never sold or shared with third parties. Our systems follow the Digital Personal Data Protection Act and ISO 27001 information security controls.",
  },
  {
    q: "What if I need to reschedule my slot?",
    a: "You can reschedule or cancel free of charge up to 2 hours before your slot from the app, the website or by calling our 24x7 helpline. Prepaid amounts are refunded to the original payment method within 3-5 working days.",
  },
];

export const cities = [
  "Delhi NCR",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Chandigarh",
  "Indore",
  "Kochi",
  "Bhopal",
  "Nagpur",
  "Surat",
];

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const extraTests: Test[] = [
  {
    name: "Fasting Blood Sugar (FBS)",
    parameters: 1,
    price: 149,
    mrp: 350,
    reportsIn: "Same day",
    fasting: "10-12 hours",
  },
  {
    name: "Iron Studies Profile",
    parameters: 5,
    price: 749,
    mrp: 1600,
    reportsIn: "24 hours",
    fasting: "Not required",
  },
  {
    name: "Urine Routine & Microscopy",
    parameters: 24,
    price: 199,
    mrp: 450,
    reportsIn: "Same day",
    fasting: "Not required",
  },
  {
    name: "Testosterone Total",
    parameters: 1,
    price: 699,
    mrp: 1500,
    reportsIn: "24 hours",
    fasting: "Not required",
  },
  {
    name: "Calcium Serum",
    parameters: 1,
    price: 249,
    mrp: 550,
    reportsIn: "Same day",
    fasting: "Not required",
  },
  {
    name: "CRP Quantitative",
    parameters: 1,
    price: 399,
    mrp: 900,
    reportsIn: "Same day",
    fasting: "Not required",
  },
  {
    name: "Dengue NS1 Antigen",
    parameters: 1,
    price: 549,
    mrp: 1200,
    reportsIn: "Same day",
    fasting: "Not required",
    tag: "Fever",
  },
  {
    name: "PCOS Hormone Panel",
    parameters: 9,
    price: 1899,
    mrp: 4200,
    reportsIn: "48 hours",
    fasting: "Not required",
  },
];

export const allTests: Test[] = [...popularTests, ...extraTests];

export const getTest = (slug: string) => allTests.find((t) => slugify(t.name) === slug);
export const getPackage = (slug: string) => packages.find((p) => slugify(p.name) === slug);

export const packageIncludes: Record<string, { group: string; items: string[] }[]> = {
  default: [
    {
      group: "Complete Blood Count",
      items: ["Haemoglobin", "RBC count", "WBC count", "Platelet count", "ESR", "MCV, MCH, MCHC"],
    },
    {
      group: "Lipid Profile",
      items: ["Total Cholesterol", "HDL", "LDL", "VLDL", "Triglycerides", "Chol/HDL ratio"],
    },
    {
      group: "Liver Function",
      items: ["SGOT", "SGPT", "Bilirubin Total", "Alkaline Phosphatase", "Albumin", "Globulin"],
    },
    {
      group: "Kidney Function",
      items: ["Urea", "Creatinine", "Uric Acid", "Sodium", "Potassium", "Chloride"],
    },
    {
      group: "Thyroid & Diabetes",
      items: ["TSH", "T3", "T4", "HbA1c", "Average Blood Glucose", "Fasting Blood Sugar"],
    },
    {
      group: "Vitamins & Minerals",
      items: ["Vitamin D (25-OH)", "Vitamin B12", "Calcium", "Iron", "Ferritin", "TIBC"],
    },
  ],
};
