// Mirrors web/src/data/site.ts's slugify exactly, so an admin-entered name produces the same slug
// shape the frontend used to generate client-side — used only to auto-derive a slug on CREATE;
// once stored, the slug is never silently regenerated from a later name edit (see admin-tests.md
// note on the slug-drift fix).
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
