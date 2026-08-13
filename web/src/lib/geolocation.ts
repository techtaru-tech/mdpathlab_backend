// Thin wrapper around the browser Geolocation API — used to capture a real lat/lng for an
// address so the backend's distance-based collection fee (haversine vs the nearest ACTIVE
// CollectionCenter) can actually run instead of always falling back to "not calculable".
export function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}
