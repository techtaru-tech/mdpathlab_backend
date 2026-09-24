import { useEffect, useState } from "react";
import { citiesApi, type City } from "@/lib/api";
import { cities as staticCities } from "@/data/site";

// No caching, same reasoning as site-settings.ts: this is an SSR-shared process, so caching here
// would mean an admin's city change never shows up again until the server restarts.
export function useCities(): City[] | null {
  const [cities, setCities] = useState<City[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    citiesApi
      .list()
      .then((c) => {
        if (!cancelled) setCities(c);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return cities;
}

// How many cities to claim in marketing copy ("Serving N+ cities") — the real count from the
// cities table, falling back to the static list's count for the very first render (server-side
// and pre-hydration) so the number doesn't visibly jump right after the page loads.
export function useCityCount(): number {
  const liveCities = useCities();
  return liveCities && liveCities.length > 0 ? liveCities.length : staticCities.length;
}
