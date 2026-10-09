// Many components on one page ask for the same small, public data (cities, categories, settings, stats) — the
// home page alone used to send 18 requests for 6 distinct things, enough to trip the API's per-visitor rate
// limit after a few pages. In the BROWSER, callers within a short window share one request. On the server
// (SSR, one process shared by every visitor) nothing is cached, so an admin's change is never stuck there.
const TTL_MS = 30_000;
const entries = new Map<string, { at: number; promise: Promise<unknown> }>();

export function sharedRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return load();
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>;
  const promise = load().catch((err) => {
    entries.delete(key); // a failed request is never reused
    throw err;
  });
  entries.set(key, { at: Date.now(), promise });
  return promise;
}
