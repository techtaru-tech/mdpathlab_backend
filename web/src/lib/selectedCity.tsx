import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCities } from "@/lib/cities";

const STORAGE_KEY = "mdpathlabs_selected_city";
const DEFAULT_CITY_NAME = "Delhi NCR";

export type SelectedCity = { id: string; name: string; slug: string };

type Ctx = {
  // The real City row once resolved (needs the live cities list to look up an id by name) —
  // null until that's happened, so every price-aware call can tell "no override yet" apart from
  // "the default city has no override, which is also normal."
  city: SelectedCity | null;
  // Always has a value for display — defaults to "Delhi NCR" the same way the old header state
  // did, even before the live city list (and therefore `city.id`) has loaded.
  cityName: string;
  selectCityByName: (name: string) => void;
};

const SelectedCityContext = createContext<Ctx | null>(null);

export function SelectedCityProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<SelectedCity | null>(null);
  const liveCities = useCities();

  // Reads localStorage only after mount — matches every other client-only hook in this app
  // (useAuthed, useCities): server and first client render both return null, so there's no
  // hydration mismatch, and the real value fills in a tick later.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCity(JSON.parse(raw));
    } catch {
      // Ignore — falls back to the default city name below.
    }
  }, []);

  function selectCityByName(name: string) {
    const match = liveCities?.find((c) => c.name === name);
    const next: SelectedCity | null = match ? { id: match.id, name: match.name, slug: match.slug } : null;
    setCity(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — selection still works for this session via React state.
    }
  }

  const cityName = city?.name ?? DEFAULT_CITY_NAME;

  return <SelectedCityContext.Provider value={{ city, cityName, selectCityByName }}>{children}</SelectedCityContext.Provider>;
}

export function useSelectedCity(): Ctx {
  const ctx = useContext(SelectedCityContext);
  if (!ctx) throw new Error("useSelectedCity must be used within a SelectedCityProvider");
  return ctx;
}
