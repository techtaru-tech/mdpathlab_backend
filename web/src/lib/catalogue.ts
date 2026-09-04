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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Not found" : "Couldn't load catalogue data");
  }
  return res.json();
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
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE";
};

/**
 * Tries tests first, then packages — /book doesn't know ahead of time which one a slug is,
 * and needs the raw catalogue id (not the display-adapted Test/Pkg shape) to add it to the cart.
 * itemType always comes from the backend response — never guessed client-side — since a Test can
 * live in either the Parameter or Profile table.
 */
export async function resolveCatalogueItemBySlug(slug: string): Promise<ResolvedCatalogueItem> {
  try {
    const row = await get<ApiTest>(`/catalogue/tests/${slug}`);
    return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, itemType: row.itemType };
  } catch {
    const row = await get<ApiPackage>(`/catalogue/packages/${slug}`);
    return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, itemType: "PACKAGE" };
  }
}

export const catalogueApi = {
  async listTests(): Promise<Test[]> {
    const rows = await get<ApiTest[]>("/catalogue/tests");
    return rows.map(toTest);
  },

  async getTest(slug: string): Promise<Test> {
    const row = await get<ApiTest>(`/catalogue/tests/${slug}`);
    return toTest(row);
  },

  async listPackages(): Promise<Pkg[]> {
    const rows = await get<ApiPackage[]>("/catalogue/packages");
    return rows.map(toPkg);
  },

  async getPackage(slug: string): Promise<Pkg> {
    const row = await get<ApiPackage>(`/catalogue/packages/${slug}`);
    return toPkg(row);
  },
};
