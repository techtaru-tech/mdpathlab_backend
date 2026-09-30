import type { Pkg, Test } from "@/data/site";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Mirrors the normalized shape CatalogueService.listTests()/getTest() return — a permanent union
// of the legacy Parameter rows and admin-managed Profile rows. itemType tells /book which table
// to add to cart against; it must always come from the backend, never be guessed client-side.
type ApiTest = {
  itemType: "PARAMETER" | "PROFILE";
  id: string;
  name: string;
  slug: string;
  testCode: string | null;
  shortDescription: string | null;
  sampleType: string | null;
  preparationInstructions: string | null;
  category: { id: string; name: string; slug: string } | null;
  mrp: number;
  price: number;
  sampleCollection: "HOME" | "LAB" | "BOTH";
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  tag: string | null;
  parametersCovered: string[];
  displayParameterCount: number | null;
};

export type CategoryItemPreview = {
  id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number;
  reportTimeHours: number;
  displayParameterCount: number;
};

export type ApiCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  description: string | null;
  testCount: number;
  // Featured packages for this category — "Preventive Packages for {category}" in the header
  // mega-menu. When empty, the frontend falls back to `tests` so the panel is never blank.
  packages: CategoryItemPreview[];
  // `tag` buckets tests into Full Body Checkup's sub-nav sections (Blood Tests, Tests by Health
  // Risks, etc.) — see CategoryMegaMenu.tsx's FullBodyCheckupPanel. Other categories ignore it.
  tests: (CategoryItemPreview & { itemType: "PARAMETER" | "PROFILE"; tag: string | null })[];
};

// Mirrors CatalogueService.listPackages()/getPackage() — the raw Package row plus its real
// PackageItem relations (never a hardcoded "what's included" text block).
type ApiPackage = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  mrp: number;
  price: number;
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  bestFor: string | null;
  badge: string | null;
  highlights: string[];
  isFeatured: boolean;
  displayParameterCount: number | null;
  items: { itemType: "PARAMETER" | "PROFILE"; parameter: { name: string } | null; profile: { name: string } | null }[];
};

// Mirrors CatalogueService.listRadiology()/getRadiology() — a radiology (X-Ray/CT/MRI/etc.)
// item is never bundled from Parameters like a Profile is, so `parametersCovered` is always
// empty; reuses the same Test display shape regardless (see toRadiology()).
type ApiRadiology = {
  itemType: "RADIOLOGY";
  id: string;
  name: string;
  slug: string;
  testCode: string | null;
  shortDescription: string | null;
  preparationInstructions: string | null;
  category: { id: string; name: string; slug: string } | null;
  mrp: number;
  price: number;
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  tag: string | null;
  modality: string | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Not found" : "Couldn't load catalogue data");
  }
  return res.json();
}

function withCityQuery(path: string, cityId?: string): string {
  return cityId ? `${path}?cityId=${encodeURIComponent(cityId)}` : path;
}

// Mirrors the copy style of the original mock data (src/data/site.ts) so swapping the data
// source doesn't change how these read on the page.
function formatReportTime(hours: number, style: "test" | "package"): string {
  if (hours <= 6) return "Same day";
  return style === "package" ? `Within ${hours} hours` : `${hours} hours`;
}

function formatFasting(required: boolean, hours: number | null): string {
  if (!required) return "Not required";
  return hours ? `${hours} hours` : "Fasting required";
}

function toTest(p: ApiTest): Test {
  return {
    name: p.name,
    slug: p.slug,
    parameters: p.displayParameterCount ?? 1,
    price: p.price,
    mrp: p.mrp,
    reportsIn: formatReportTime(p.reportTimeHours, "test"),
    fasting: formatFasting(p.fastingRequired, p.fastingHours),
    ...(p.tag ? { tag: p.tag } : {}),
    ...(p.sampleType ? { sampleType: p.sampleType } : {}),
    ...(p.preparationInstructions ? { preparationInstructions: p.preparationInstructions } : {}),
    ...(p.parametersCovered.length ? { parametersCovered: p.parametersCovered } : {}),
    ...(p.category ? { category: { name: p.category.name, slug: p.category.slug } } : {}),
  };
}

// Radiology reuses the storefront's Test display shape (name/slug/price/reportsIn/fasting/tag)
// plus `modality` (X-Ray/CT/MRI/etc.) — there's no "parameters covered" concept for it, so
// `parameters` is always 0 and the tests.$slug-style "N parameters included" copy never renders.
export type RadiologyItem = Test & { modality: string | null };

function toRadiology(p: ApiRadiology): RadiologyItem {
  return {
    name: p.name,
    slug: p.slug,
    parameters: 0,
    price: p.price,
    mrp: p.mrp,
    reportsIn: formatReportTime(p.reportTimeHours, "test"),
    fasting: formatFasting(p.fastingRequired, p.fastingHours),
    modality: p.modality,
    ...(p.tag ? { tag: p.tag } : {}),
    ...(p.preparationInstructions ? { preparationInstructions: p.preparationInstructions } : {}),
    ...(p.category ? { category: { name: p.category.name, slug: p.category.slug } } : {}),
  };
}

function toPkg(p: ApiPackage): Pkg {
  const includedItems = p.items
    .map((i) => (i.itemType === "PARAMETER" ? i.parameter?.name : i.profile?.name))
    .filter((name): name is string => Boolean(name));
  return {
    name: p.name,
    slug: p.slug,
    subtitle: p.subtitle ?? "",
    parameters: p.displayParameterCount ?? 0,
    price: p.price,
    mrp: p.mrp,
    reportsIn: formatReportTime(p.reportTimeHours, "package"),
    bestFor: p.bestFor ?? "",
    highlights: p.highlights,
    fasting: formatFasting(p.fastingRequired, p.fastingHours),
    ...(p.badge ? { badge: p.badge } : {}),
    ...(p.isFeatured ? { featured: true } : {}),
    ...(includedItems.length ? { includedItems } : {}),
  };
}

export type ResolvedCatalogueItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number;
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE" | "RADIOLOGY";
};

/**
 * Tries tests, then packages, then radiology — /book doesn't know ahead of time which one a slug
 * is, and needs the raw catalogue id (not the display-adapted Test/Pkg shape) to add it to the
 * cart. itemType always comes from the backend response — never guessed client-side — since a
 * Test can live in either the Parameter or Profile table.
 */
export async function resolveCatalogueItemBySlug(slug: string): Promise<ResolvedCatalogueItem> {
  try {
    const row = await get<ApiTest>(`/catalogue/tests/${slug}`);
    return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, itemType: row.itemType };
  } catch {
    try {
      const row = await get<ApiPackage>(`/catalogue/packages/${slug}`);
      return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, itemType: "PACKAGE" };
    } catch {
      const row = await get<ApiRadiology>(`/catalogue/radiology/${slug}`);
      return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, itemType: "RADIOLOGY" };
    }
  }
}

export const catalogueApi = {
  async listTests(cityId?: string): Promise<Test[]> {
    const rows = await get<ApiTest[]>(withCityQuery("/catalogue/tests", cityId));
    return rows.map(toTest);
  },

  async getTest(slug: string, cityId?: string): Promise<Test> {
    const row = await get<ApiTest>(withCityQuery(`/catalogue/tests/${slug}`, cityId));
    return toTest(row);
  },

  async listPackages(cityId?: string): Promise<Pkg[]> {
    const rows = await get<ApiPackage[]>(withCityQuery("/catalogue/packages", cityId));
    return rows.map(toPkg);
  },

  async getPackage(slug: string, cityId?: string): Promise<Pkg> {
    const row = await get<ApiPackage>(withCityQuery(`/catalogue/packages/${slug}`, cityId));
    return toPkg(row);
  },

  listCategories(cityId?: string): Promise<ApiCategory[]> {
    return get<ApiCategory[]>(withCityQuery("/catalogue/categories", cityId));
  },

  async listRadiology(cityId?: string): Promise<RadiologyItem[]> {
    const rows = await get<ApiRadiology[]>(withCityQuery("/catalogue/radiology", cityId));
    return rows.map(toRadiology);
  },

  async getRadiology(slug: string, cityId?: string): Promise<RadiologyItem> {
    const row = await get<ApiRadiology>(withCityQuery(`/catalogue/radiology/${slug}`, cityId));
    return toRadiology(row);
  },
};
