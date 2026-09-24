import { useEffect, useState } from "react";
import { statsApi, type SiteStats } from "@/lib/api";

const FALLBACK: SiteStats = { customersServed: 0, testsProcessed: 0, averageRating: null, reviewCount: 0 };

// No caching, same reasoning as cities.ts/site-settings.ts: this is an SSR-shared process, so
// caching here would mean a new order/review never shows up again until the server restarts.
export function useSiteStats(): SiteStats {
  const [stats, setStats] = useState<SiteStats>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    statsApi
      .get()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // Leave the zeroed fallback in place — better than showing a broken/stale number.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
