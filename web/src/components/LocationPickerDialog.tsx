import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { getCurrentPosition } from "@/lib/geolocation";
import { cn } from "@/lib/utils";

// India-wide default view used only to frame the map before the patient has picked a point —
// never used as a stand-in for the patient's actual location.
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };

// Place/address types the Places API considers precise enough to trust directly.
const EXACT_PLACE_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "establishment",
  "point_of_interest",
  "health",
  "hospital",
  "doctor",
  "pharmacy",
  "school",
  "university",
  "park",
  "airport",
  "store",
  "restaurant",
  "lodging",
  "place_of_worship",
  "tourist_attraction",
]);
// Place/address types that only describe a broad area, never a specific point.
const APPROXIMATE_PLACE_TYPES = new Set([
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "neighborhood",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "postal_code",
  "postal_town",
  "country",
  "political",
  "plus_code",
]);

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A place is "approximate" if its own types say so, or — when types are missing or ambiguous —
// if its recommended viewport spans a wide area (a city/locality-sized box, not a single premise).
function classifyApproximate(types: string[] | undefined, viewport: google.maps.LatLngBounds | null | undefined): boolean {
  if (types?.some((t) => EXACT_PLACE_TYPES.has(t))) return false;
  if (types?.some((t) => APPROXIMATE_PLACE_TYPES.has(t))) return true;
  if (viewport) {
    const ne = viewport.getNorthEast();
    const sw = viewport.getSouthWest();
    const diagonalKm = haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng());
    return diagonalKm > 1.5;
  }
  return false;
}

type PickedAddress = { line1?: string; city?: string; pincode?: string };

function addressFromComponents(getLongText: (type: string) => string | undefined): PickedAddress | undefined {
  const streetNumber = getLongText("street_number");
  const route = getLongText("route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ") || undefined;
  const city = getLongText("locality") ?? getLongText("sublocality") ?? getLongText("administrative_area_level_2");
  const pincode = getLongText("postal_code");
  if (!line1 && !city && !pincode) return undefined;
  return { ...(line1 ? { line1 } : {}), ...(city ? { city } : {}), ...(pincode ? { pincode } : {}) };
}

function addressFromGeocoderComponents(components: google.maps.GeocoderAddressComponent[]): PickedAddress | undefined {
  return addressFromComponents((type) => components.find((c) => c.types.includes(type))?.long_name);
}

export type PickedLocation = { lat: number; lng: number; address: PickedAddress | undefined };

type GoogleLibs = {
  Map: typeof google.maps.Map;
  Marker: typeof google.maps.Marker;
  Geocoder: typeof google.maps.Geocoder;
  // The newer google.maps.places.AutocompleteSuggestion / Place API requires the "Places API
  // (New)" product enabled in Google Cloud Console — a separate enablement from the classic
  // "Places API" this project actually has. Using the classic AutocompleteService/PlacesService
  // here so search works with what's currently enabled; see the final report for what enabling
  // the newer API would unlock.
  AutocompleteService: typeof google.maps.places.AutocompleteService;
  PlacesService: typeof google.maps.places.PlacesService;
  AutocompleteSessionToken: typeof google.maps.places.AutocompleteSessionToken;
  Size: typeof google.maps.Size;
  Point: typeof google.maps.Point;
  event: typeof google.maps.event;
};

// Google's loader touches `window`/`document` only inside function bodies, not at module-eval
// time, but it's still loaded lazily (only inside client-only effect code) to match the same
// SSR-safety discipline as the rest of this component, and so the API key is never even requested
// during a server render.
let googleLibsPromise: Promise<GoogleLibs> | null = null;
function loadGoogleLibs(): Promise<GoogleLibs> {
  googleLibsPromise ??= (async () => {
    const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
    setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, v: "weekly" });
    const [mapsLib, markerLib, geocodingLib, placesLib, coreLib] = await Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
      importLibrary("geocoding"),
      importLibrary("places"),
      importLibrary("core"),
    ]);
    return {
      Map: mapsLib.Map,
      Marker: markerLib.Marker,
      Geocoder: geocodingLib.Geocoder,
      AutocompleteService: placesLib.AutocompleteService,
      PlacesService: placesLib.PlacesService,
      AutocompleteSessionToken: placesLib.AutocompleteSessionToken,
      Size: coreLib.Size,
      Point: coreLib.Point,
      event: coreLib.event,
    };
  })();
  return googleLibsPromise;
}

function buildMarkerIcon(libs: GoogleLibs, approximate: boolean): google.maps.Icon {
  const fill = approximate ? "#f59e0b" : "#e11d48";
  const svg = `<svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="${fill}"${approximate ? ' fill-opacity="0.75" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"' : ""}/>
    <circle cx="18" cy="18" r="7" fill="white"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new libs.Size(36, 48),
    anchor: new libs.Point(18, 48),
  };
}

type SearchResult = {
  placeId: string;
  label: string;
  secondaryLabel: string | undefined;
  approximate: boolean;
};

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
  const libsRef = useRef<GoogleLibs | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // True only for an unrefined search result Google could only match to a broad area (a city,
  // locality, or pincode — not a specific point) — cleared the moment the patient drags/taps/uses
  // GPS, since that's their own deliberate placement. Confirm is disabled while true so an
  // approximate area can never be saved as if it were the patient's real collection point.
  const [pinIsApproximate, setPinIsApproximate] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [locatingInitial, setLocatingInitial] = useState(false);
  const [noAutoLocation, setNoAutoLocation] = useState(false);
  const [geocodeLabel, setGeocodeLabel] = useState<string | null>(null);
  const [geocodeAddress, setGeocodeAddress] = useState<PickedAddress | undefined>(undefined);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  function handleSearchInputChange(value: string) {
    setSearchQuery(value);
    setShowSearchResults(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      searchGenerationRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => void runSearch(value.trim()), 300);
  }

  async function runSearch(query: string) {
    const generation = ++searchGenerationRef.current;
    setSearching(true);
    setSearchError(false);
    try {
      const libs = await loadGoogleLibs();
      autocompleteServiceRef.current ??= new libs.AutocompleteService();
      if (!sessionTokenRef.current) sessionTokenRef.current = new libs.AutocompleteSessionToken();
      const { predictions } = await autocompleteServiceRef.current.getPlacePredictions({
        input: query,
        componentRestrictions: { country: "in" },
        sessionToken: sessionTokenRef.current,
      });
      if (generation !== searchGenerationRef.current) return;
      const results: SearchResult[] = predictions.map((p) => ({
        placeId: p.place_id,
        label: p.structured_formatting?.main_text ?? p.description,
        secondaryLabel: p.structured_formatting?.secondary_text ?? undefined,
        approximate: classifyApproximate(p.types, null),
      }));
      setSearchResults(results);
    } catch {
      if (generation !== searchGenerationRef.current) return;
      setSearchResults([]);
      setSearchError(true);
    } finally {
      if (generation === searchGenerationRef.current) setSearching(false);
    }
  }

  async function handleSelectSearchResult(result: SearchResult) {
    setSearchQuery(result.label);
    setShowSearchResults(false);
    setSearchResults([]);
    try {
      const libs = await loadGoogleLibs();
      if (!mapRef.current) return;
      placesServiceRef.current ??= new libs.PlacesService(mapRef.current);
      const fetched = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
        placesServiceRef.current!.getDetails(
          {
            placeId: result.placeId,
            fields: ["geometry", "types", "address_components", "formatted_address"],
            ...(sessionTokenRef.current ? { sessionToken: sessionTokenRef.current } : {}),
          },
          (place, status) => {
            if (status === "OK" && place) resolve(place);
            else reject(new Error(status));
          },
        );
      });
      sessionTokenRef.current = null; // session concluded once getDetails is called, per Google's billing model
      const location = fetched.geometry?.location;
      if (!location || !mapRef.current) return;
      const lat = location.lat();
      const lng = location.lng();
      const approximate = classifyApproximate(fetched.types, fetched.geometry?.viewport);
      mapRef.current.setCenter({ lat, lng });
      mapRef.current.setZoom(approximate ? 13 : 16);
      placeMarker(lat, lng, {
        approximate,
        addressOverride: {
          label: fetched.formatted_address ?? result.label,
          address: fetched.address_components ? addressFromGeocoderComponents(fetched.address_components) : undefined,
        },
      });
    } catch {
      setSearchError(true);
    }
  }

  function clearSearch() {
    searchGenerationRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    setSearchError(false);
  }

  async function reverseGeocode(lat: number, lng: number) {
    setGeocoding(true);
    setGeocodeError(false);
    try {
      const libs = libsRef.current ?? (await loadGoogleLibs());
      geocoderRef.current ??= new libs.Geocoder();
      const response = await geocoderRef.current.geocode({ location: { lat, lng } });
      const result = response.results[0];
      if (!result) throw new Error("no geocode result");
      setGeocodeLabel(result.formatted_address);
      setGeocodeAddress(addressFromGeocoderComponents(result.address_components));
    } catch {
      setGeocodeLabel(null);
      setGeocodeAddress(undefined);
      setGeocodeError(true);
    } finally {
      setGeocoding(false);
    }
  }

  function placeMarker(lat: number, lng: number, opts?: { approximate?: boolean; addressOverride?: { label: string; address: PickedAddress | undefined } }) {
    const libs = libsRef.current;
    if (!libs || !mapRef.current) return;
    const approximate = !!opts?.approximate;
    const position = { lat, lng };
    setCoords(position);
    setPinIsApproximate(approximate);
    setNoAutoLocation(false);
    if (markerRef.current) {
      markerRef.current.setPosition(position);
      markerRef.current.setIcon(buildMarkerIcon(libs, approximate));
    } else {
      const marker = new libs.Marker({ position, map: mapRef.current, draggable: true, icon: buildMarkerIcon(libs, approximate) });
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (!pos) return;
        setCoords({ lat: pos.lat(), lng: pos.lng() });
        setPinIsApproximate(false); // a manual drag is the patient's own deliberate placement
        marker.setIcon(buildMarkerIcon(libs, false));
        void reverseGeocode(pos.lat(), pos.lng());
      });
      markerRef.current = marker;
    }
    if (opts?.addressOverride) {
      setGeocodeLabel(opts.addressOverride.label);
      setGeocodeAddress(opts.addressOverride.address);
      setGeocodeError(false);
      setGeocoding(false);
    } else {
      void reverseGeocode(lat, lng);
    }
  }

  useEffect(() => {
    if (!open) return;
    setMapError(false);
    setCoords(initial ?? null);
    setPinIsApproximate(false);
    setNoAutoLocation(false);
    setGeocodeLabel(null);
    setGeocodeAddress(undefined);
    setGeocodeError(false);
    searchGenerationRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setSearchError(false);
    setShowSearchResults(false);
    sessionTokenRef.current = null;

    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      setMapError(true);
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    // Google's official hook: fires specifically when the API key is missing, invalid, or blocked
    // by an HTTP-referrer restriction — surfaces that as a clear "map failed to load" state instead
    // of a silent blank map.
    window.gm_authFailure = () => {
      if (!cancelled) setMapError(true);
    };

    (async () => {
      let libs: GoogleLibs;
      try {
        libs = await loadGoogleLibs();
      } catch {
        if (!cancelled) setMapError(true);
        return;
      }
      if (cancelled) return;
      libsRef.current = libs;

      const container = containerRef.current;
      if (!container) return;

      let map: google.maps.Map;
      try {
        map = new libs.Map(container, {
          center: INDIA_CENTER,
          zoom: 5,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
      } catch {
        setMapError(true);
        return;
      }
      mapRef.current = map;

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        setShowSearchResults(false);
        placeMarker(e.latLng.lat(), e.latLng.lng());
      });

      resizeObserver = new ResizeObserver(() => libs.event.trigger(map, "resize"));
      resizeObserver.observe(container);

      if (initial) {
        map.setCenter(initial);
        map.setZoom(16);
        placeMarker(initial.lat, initial.lng);
        return;
      }
      setLocatingInitial(true);
      const pos = await getCurrentPosition();
      if (cancelled) return;
      setLocatingInitial(false);
      if (pos) {
        map.setCenter(pos);
        map.setZoom(16);
        placeMarker(pos.lat, pos.lng);
      } else {
        setNoAutoLocation(true);
      }
    })();

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      resizeObserver?.disconnect();
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleUseCurrentLocation() {
    setLocatingInitial(true);
    void getCurrentPosition().then((pos) => {
      setLocatingInitial(false);
      if (!pos || !mapRef.current) return;
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(16);
      placeMarker(pos.lat, pos.lng);
    });
  }

  function handleConfirm() {
    if (!coords || pinIsApproximate) return; // never hand back an unrefined approximate location
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
            <p className="text-xs text-muted-foreground">
              This can happen if the map configuration is temporarily unavailable. Check your connection and try again, or use "Use my current
              location" instead.
            </p>
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
                  placeholder="Search your address"
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
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {searchError ? (
                    <p className="px-3 py-2 text-xs font-semibold text-warning">Search unavailable — check your connection.</p>
                  ) : (
                    searchResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => void handleSelectSearchResult(r)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <MapPin className={cn("mt-0.5 h-3 w-3 shrink-0", r.approximate ? "text-warning" : "text-primary")} />
                        <span className="flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block">{r.label}</span>
                            {r.approximate ? (
                              <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">Approximate</span>
                            ) : null}
                          </span>
                          {r.secondaryLabel ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{r.secondaryLabel}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : showSearchResults && !searching && searchQuery.trim().length >= 2 ? (
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

            {pinIsApproximate ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                This pin marks an approximate area, not your exact address. Drag it to your exact collection location to enable Confirm.
              </p>
            ) : noAutoLocation && !coords ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                Couldn't detect your location automatically. Tap the map to drop a pin, or drag it once placed.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Drag the pin or tap anywhere on the map to set the exact spot.</p>
            )}

            <div className="rounded-xl bg-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" /> Selected location
                {pinIsApproximate ? (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">Approximate</span>
                ) : coords ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Exact</span>
                ) : null}
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
              <div className="flex flex-col items-end gap-1">
                <ActionButton type="button" size="sm" variant="primary" onClick={handleConfirm} disabled={!coords || pinIsApproximate}>
                  Confirm location
                </ActionButton>
                {pinIsApproximate ? <p className="text-[11px] font-semibold text-warning">Drag the pin to your exact spot first</p> : null}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
