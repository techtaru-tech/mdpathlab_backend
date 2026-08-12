import { useMemo, useState } from "react";
import { Check, Landmark, LocateFixed, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cities } from "@/data/site";
import { cn } from "@/lib/utils";

const popularCities = cities.slice(0, 8);
const otherCities = cities.slice(8);

const cityCoords: Record<string, [number, number]> = {
  "Delhi NCR": [28.6139, 77.209],
  Mumbai: [19.076, 72.8777],
  Bengaluru: [12.9716, 77.5946],
  Hyderabad: [17.385, 78.4867],
  Chennai: [13.0827, 80.2707],
  Pune: [18.5204, 73.8567],
  Kolkata: [22.5726, 88.3639],
  Ahmedabad: [23.0225, 72.5714],
  Jaipur: [26.9124, 75.7873],
  Lucknow: [26.8467, 80.9462],
  Chandigarh: [30.7333, 76.7794],
  Indore: [22.7196, 75.8577],
  Kochi: [9.9312, 76.2673],
  Bhopal: [23.2599, 77.4126],
  Nagpur: [21.1458, 79.0882],
  Surat: [21.1702, 72.8311],
};

function nearestCity(lat: number, lng: number) {
  let best = cities[0]!;
  let bestDist = Infinity;
  for (const [city, [cLat, cLng]] of Object.entries(cityCoords)) {
    const dLat = ((cLat - lat) * Math.PI) / 180;
    const dLng = ((cLng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) * Math.cos((cLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const dist = 2 * 6371 * Math.asin(Math.sqrt(a));
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best;
}

export function LocationModal({
  open,
  onOpenChange,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string;
  onSelect: (city: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  const filtered = useMemo(
    () => cities.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  const pick = (city: string) => {
    onSelect(city);
    onOpenChange(false);
    setQuery("");
    setLocateError("");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocateError("Location isn't supported on this browser.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick(nearestCity(pos.coords.latitude, pos.coords.longitude));
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't access your location. Please pick a city below.");
      },
      { timeout: 8000 },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setLocateError("");
        }
      }}
    >
      <DialogContent className="max-w-4xl gap-0 overflow-hidden rounded-[var(--radius-lg)] border-border bg-card p-0 shadow-[var(--shadow-lift)]">
        <DialogTitle className="sr-only">Choose your city</DialogTitle>

        <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center">
          <h2 className="text-xl leading-tight font-extrabold whitespace-nowrap">
            Select your
            <br />
            location
          </h2>

          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-muted px-4 py-3">
            <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for your city…"
              aria-label="Search your city"
              className="w-full min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-primary hover:underline disabled:opacity-60"
          >
            <LocateFixed className={cn("h-4 w-4", locating && "animate-pulse")} />
            {locating ? "Locating…" : "Use current location"}
          </button>
        </div>

        {locateError ? (
          <p className="border-b border-warning/20 bg-warning/10 px-6 py-2.5 text-xs font-semibold text-foreground/80">
            {locateError}
          </p>
        ) : null}

        <div className="max-h-[65vh] overflow-y-auto p-6">
          {query.trim() ? (
            filtered.length ? (
              <>
                <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                  {filtered.length} {filtered.length === 1 ? "city" : "cities"} found
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {filtered.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pick(c)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition-colors",
                        c === selected
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border hover:border-primary/30",
                      )}
                    >
                      <span className="truncate">{c}</span>
                      {c === selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                We don't collect samples in "{query}" yet. Try Delhi NCR, Mumbai or Bengaluru.
              </p>
            )
          ) : (
            <>
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Popular cities
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {popularCities.map((c) => {
                  const isSelected = c === selected;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pick(c)}
                      className="group flex flex-col items-center gap-2"
                    >
                      <span
                        className={cn(
                          "grid h-16 w-16 place-items-center rounded-2xl border transition-colors",
                          isSelected
                            ? "border-primary bg-primary-soft text-primary"
                            : "border-border bg-muted text-primary group-hover:border-primary/40",
                        )}
                      >
                        {isSelected ? <Check className="h-6 w-6" /> : <Landmark className="h-6 w-6" />}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold",
                          isSelected ? "text-primary" : "text-foreground",
                        )}
                      >
                        {c}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-7 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Other cities
              </p>
              <div className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-4">
                {otherCities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    className={cn(
                      "flex items-center gap-1.5 text-left text-sm font-semibold transition-colors",
                      c === selected ? "text-primary" : "text-muted-foreground hover:text-primary",
                    )}
                  >
                    {c === selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
