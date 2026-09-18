import { useEffect, useState } from "react";
import { catalogueApi, type ApiCategory } from "@/lib/catalogue";

// No caching, same reasoning as cities.ts/site-settings.ts: this is an SSR-shared process, so
// caching here would mean an admin's category change never shows up again until the server
// restarts.
export function useCategories(): ApiCategory[] | null {
  const [categories, setCategories] = useState<ApiCategory[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    catalogueApi
      .listCategories()
      .then((c) => {
        if (!cancelled) setCategories(c);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return categories;
}
