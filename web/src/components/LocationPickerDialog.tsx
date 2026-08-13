import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { getCurrentPosition } from "@/lib/geolocation";

// India-wide default view used only to frame the map before the patient has picked a point —
// never used as a stand-in for the patient's actual location.
const INDIA_CENTER: [number, number] = [22.9734, 78.6569];

// Leaflet's UMD build touches `window` at module-evaluation time, which crashes TanStack Start's
// SSR pass if imported statically — so it's loaded lazily, only inside client-only effect code.
let leafletPromise: Promise<typeof Leaflet> | null = null;
function loadLeaflet() {
  leafletPromise ??= import("leaflet").then((mod) => mod.default ?? mod);
  return leafletPromise;
}

function createPinIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: "",
    html: `<svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="#e11d48"/>
      <circle cx="18" cy="18" r="7" fill="white"/>
    </svg>`,
    iconSize: [36, 48],
    iconAnchor: [18, 48],
  });
}

export type PickedLocation = {
  lat: number;
  lng: number;
  address: { line1?: string; city?: string; pincode?: string } | undefined;
};

type NominatimResult = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
};

function toPickedAddress(result: NominatimResult | null): { line1?: string; city?: string; pincode?: string } | undefined {
  if (!result?.address) return undefined;
  const a = result.address;
  const line1Parts = [a.house_number, a.road ?? a.suburb ?? a.neighbourhood].filter(Boolean);
  return {
    ...(line1Parts.length ? { line1: line1Parts.join(" ") } : {}),
    ...(a.city ?? a.town ?? a.village ? { city: (a.city ?? a.town ?? a.village) as string } : {}),
    ...(a.postcode ? { pincode: a.postcode } : {}),
  };
}

type SearchResult = { lat: number; lng: number; label: string };

export function LocationPickerDialog({
  open,
  onOpenChange,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { lat: number; lng: number } | null;
  onConfirm: (result: PickedLocation) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapError, setMapError] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [locatingInitial, setLocatingInitial] = useState(false);
  const [noAutoLocation, setNoAutoLocation] = useState(false);
  const [geocodeLabel, setGeocodeLabel] = useState<string | null>(null);
  const [geocodeAddress, setGeocodeAddress] = useState<{ line1?: string; city?: string; pincode?: string } | undefined>(undefined);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchBroadened, setSearchBroadened] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  function handleSearchInputChange(value: string) {
    setSearchQuery(value);
    setShowSearchResults(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 3) {
      searchGenerationRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
      setSearchBroadened(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => void runSearch(value.trim()), 450);
  }

  async function searchNominatim(query: string) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=6&addressdetails=0&countrycodes=in`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error("search failed");
    const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
    return data.map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name }));
  }

  // Nominatim's free-text search frequently fails on long, highly specific Indian addresses
  // (business names, house numbers, small localities aren't consistently in OSM) even though
  // it can resolve the same address once trimmed down to its broader locality/city/pincode. So
  // on an empty result, retry with progressively broader queries (dropping the leftmost,
  // most-specific comma segment each time) instead of giving up after one attempt.
  async function runSearch(query: string) {
    const generation = ++searchGenerationRef.current;
    setSearching(true);
    setSearchError(false);
    setSearchBroadened(false);
    const segments = query.split(",").map((s) => s.trim()).filter(Boolean);
    const attempts = segments.length > 1 ? segments.map((_, i) => segments.slice(i).join(", ")) : [query];
    const maxAttempts = Math.min(attempts.length, 8);
    try {
      for (let i = 0; i < maxAttempts; i++) {
        const attemptQuery = attempts[i] ?? query;
        const results = await searchNominatim(attemptQuery);
        if (generation !== searchGenerationRef.current) return; // a newer search superseded this one
        if (results.length > 0) {
          setSearchResults(results);
          setSearchBroadened(i > 0);
          return;
        }
        if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 1100)); // Nominatim's public usage policy: max 1 req/sec
        if (generation !== searchGenerationRef.current) return;
      }
      setSearchResults([]);
    } catch {
      if (generation !== searchGenerationRef.current) return;
      setSearchResults([]);
      setSearchError(true);
    } finally {
      if (generation === searchGenerationRef.current) setSearching(false);
    }
  }

  function handleSelectSearchResult(result: SearchResult) {
    setSearchQuery(result.label);
    setShowSearchResults(false);
    setSearchResults([]);
    if (!mapRef.current) return;
    mapRef.current.setView([result.lat, result.lng], 16);
    placeMarker(result.lat, result.lng);
  }

  function clearSearch() {
    searchGenerationRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    setSearchError(false);
    setSearchBroadened(false);
  }

  async function reverseGeocode(lat: number, lng: number) {
    setGeocoding(true);
    setGeocodeError(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("geocode failed");
      const data: NominatimResult = await res.json();
      setGeocodeLabel(data.display_name ?? null);
      setGeocodeAddress(toPickedAddress(data));
    } catch {
      setGeocodeLabel(null);
      setGeocodeAddress(undefined);
      setGeocodeError(true);
    } finally {
      setGeocoding(false);
    }
  }

  function placeMarker(lat: number, lng: number) {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    setCoords({ lat, lng });
    setNoAutoLocation(false);
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { icon: createPinIcon(L), draggable: true }).addTo(mapRef.current);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setCoords({ lat: pos.lat, lng: pos.lng });
        void reverseGeocode(pos.lat, pos.lng);
      });
      markerRef.current = marker;
    }
    void reverseGeocode(lat, lng);
  }

  useEffect(() => {
    if (!open) return;
    setMapError(false);
    setTilesFailed(false);
    setCoords(initial ?? null);
    setNoAutoLocation(false);
    setGeocodeLabel(null);
    setGeocodeAddress(undefined);
    setGeocodeError(false);
    searchGenerationRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setSearchError(false);
    setSearchBroadened(false);
    setShowSearchResults(false);

    let cancelled = false;
    let map: Leaflet.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      let L: typeof Leaflet;
      try {
        L = await loadLeaflet();
      } catch {
        if (!cancelled) setMapError(true);
        return;
      }
      if (cancelled) return;
      leafletRef.current = L;

      const container = containerRef.current;
      if (!container) return;

      try {
        map = L.map(container, { zoomControl: true, attributionControl: true, center: INDIA_CENTER, zoom: 5 });
      } catch {
        setMapError(true);
        return;
      }
      mapRef.current = map;

      const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      let tileErrorCount = 0;
      tileLayer.on("tileerror", () => {
        tileErrorCount += 1;
        if (tileErrorCount > 3) setTilesFailed(true);
      });
      tileLayer.addTo(map);

      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        setShowSearchResults(false);
        placeMarker(e.latlng.lat, e.latlng.lng);
      });

      requestAnimationFrame(() => map?.invalidateSize());
      resizeObserver = new ResizeObserver(() => map?.invalidateSize());
      resizeObserver.observe(container);

      if (initial) {
        map.setView([initial.lat, initial.lng], 16);
        placeMarker(initial.lat, initial.lng);
        return;
      }
      setLocatingInitial(true);
      const pos = await getCurrentPosition();
      if (cancelled) return;
      setLocatingInitial(false);
      if (pos) {
        map.setView([pos.lat, pos.lng], 16);
        placeMarker(pos.lat, pos.lng);
      } else {
        setNoAutoLocation(true);
      }
    })();

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleUseCurrentLocation() {
    setLocatingInitial(true);
    void getCurrentPosition().then((pos) => {
      setLocatingInitial(false);
      if (!pos || !mapRef.current) return;
      mapRef.current.setView([pos.lat, pos.lng], 16);
      placeMarker(pos.lat, pos.lng);
    });
  }

  function handleConfirm() {
    if (!coords) return;
    onConfirm({ lat: coords.lat, lng: coords.lng, address: geocodeAddress });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Choose location on map</DialogTitle>
        </DialogHeader>

        {mapError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted p-8 text-center">
            <p className="text-sm font-semibold text-foreground">Map failed to load</p>
            <p className="text-xs text-muted-foreground">Check your connection and try again, or use "Use my current location" instead.</p>
            <ActionButton type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </ActionButton>
          </div>
        ) : (
          <>
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onFocus={() => setShowSearchResults(true)}
                  placeholder="Search for a place or address"
                  className="h-10 w-full bg-transparent text-sm font-medium focus:outline-none"
                />
                {searching ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : searchQuery ? (
                  <button type="button" onClick={clearSearch} aria-label="Clear search" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {showSearchResults && searching && searchResults.length === 0 ? (
                <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-card p-3 shadow-lg">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> Searching…
                  </p>
                </div>
              ) : showSearchResults && (searchResults.length > 0 || searchError) ? (
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {searchError ? (
                    <p className="px-3 py-2 text-xs font-semibold text-warning">Search unavailable — check your connection.</p>
                  ) : (
                    <>
                      {searchBroadened ? (
                        <p className="border-b border-border px-3 py-2 text-[11px] font-semibold text-warning">
                          Exact address not found — showing a nearby broader area. Drag the pin to the precise spot.
                        </p>
                      ) : null}
                      {searchResults.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSelectSearchResult(r)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          {r.label}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ) : showSearchResults && !searching && searchQuery.trim().length >= 3 ? (
                <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-card p-3 shadow-lg">
                  <p className="text-xs text-muted-foreground">No results found for "{searchQuery}"</p>
                </div>
              ) : null}
            </div>

            <div className="relative h-[min(60vh,420px)] w-full overflow-hidden rounded-xl border border-border">
              <div ref={containerRef} className="h-full w-full touch-none" />
              {locatingInitial ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
                  <span className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding your location…
                  </span>
                </div>
              ) : null}
            </div>

            {noAutoLocation && !coords ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                Couldn't detect your location automatically. Tap the map to drop a pin, or drag it once placed.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Drag the pin or tap anywhere on the map to set the exact spot.</p>
            )}

            {tilesFailed ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                Map imagery isn't loading fully — you can still drop a pin using approximate positioning.
              </p>
            ) : null}

            <div className="rounded-xl bg-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" /> Selected location
              </p>
              {coords ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {geocoding ? "Looking up address…" : geocodeLabel ?? (geocodeError ? "Address lookup unavailable — coordinates only" : "Address unavailable")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No location selected yet.</p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <ActionButton type="button" size="sm" variant="outline" onClick={handleUseCurrentLocation} className="flex items-center justify-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" /> Use my current location
              </ActionButton>
              <ActionButton type="button" size="sm" variant="primary" onClick={handleConfirm} disabled={!coords}>
                Confirm location
              </ActionButton>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
