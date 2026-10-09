// Where to send someone after login/registration. Only an in-site path is ever followed: an absolute URL,
// a protocol-relative one ("//evil.com", "/\\evil.com") or "javascript:" would otherwise run on this origin
// or take the person off-site.
export function safeRedirect(value?: string | null, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** A plain address check — something@something.tld, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}
