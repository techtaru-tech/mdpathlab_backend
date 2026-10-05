// Stored image paths are relative (/uploads/...); mobile clients need an absolute URL. Falls back to
// the placeholder so an item without an image still renders something.
export function absoluteImageUrl(url: string | null | undefined, requestBase: string): string {
  const base = (process.env.PUBLIC_API_URL ?? requestBase).replace(/\/+$/, '');
  if (!url) return process.env.HOME_PLACEHOLDER_IMAGE_URL ?? `${base}/uploads/placeholder.png`;
  return /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
