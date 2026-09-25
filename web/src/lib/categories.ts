import { useEffect, useState } from "react";
import { catalogueApi, type ApiCategory } from "@/lib/catalogue";
import { useSelectedCity } from "@/lib/selectedCity";

// No caching, same reasoning as cities.ts/site-settings.ts: this is an SSR-shared process, so
// caching here would mean an admin's category change never shows up again until the server
// restarts. Re-fetches whenever the selected city resolves/changes so counts/previews match what
// the city-filtered test and package lists actually show (see CatalogueService.isAvailableInCity).
export function useCategories(): ApiCategory[] | null {
  const { city } = useSelectedCity();
  const [categories, setCategories] = useState<ApiCategory[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    catalogueApi
      .listCategories(city?.id)
      .then((c) => {
        if (!cancelled) setCategories(c);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [city?.id]);
  return categories;
}
