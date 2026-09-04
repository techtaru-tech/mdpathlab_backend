import { useEffect, useState } from "react";
import { citiesApi, type City } from "@/lib/api";

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
