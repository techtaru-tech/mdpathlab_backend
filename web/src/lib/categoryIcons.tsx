import {
  Activity,
  Baby,
  ClipboardCheck,
  Dna,
  Droplet,
  FlaskConical,
  HeartPulse,
  Ribbon,
  Stethoscope,
  Wind,
  type LucideIcon,
} from "lucide-react";

// Icon per known category slug — shared between the header's mega-menu and the homepage's
// "shop by health concern" section so the two never drift into different icon choices for the
// same category. A genuinely new category (admin-added later) falls back to Stethoscope below
// rather than needing a code change every time.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "full-body-checkup": ClipboardCheck,
  heart: HeartPulse,
  cancer: Ribbon,
  thyroid: Activity,
  diabetes: Droplet,
  pregnancy: Baby,
  "allergy-intolerance": Wind,
  hormone: FlaskConical,
  "dna-test": Dna,
};

export function iconForCategory(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? Stethoscope;
}

// Exact order the client's reference navigation uses — shown in this order rather than plain
// alphabetical (which is what the API returns). Anything an admin adds later that isn't in this
// list just falls to the end, alphabetically.
export const FEATURED_CATEGORY_SLUGS = [
  "full-body-checkup",
  "heart",
  "cancer",
  "thyroid",
  "diabetes",
  "pregnancy",
  "allergy-intolerance",
  "hormone",
  "dna-test",
];

export function sortCategoriesFeaturedFirst<T extends { slug: string; name: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => {
    const ai = FEATURED_CATEGORY_SLUGS.indexOf(a.slug);
    const bi = FEATURED_CATEGORY_SLUGS.indexOf(b.slug);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
