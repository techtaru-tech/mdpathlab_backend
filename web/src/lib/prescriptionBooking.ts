// Carries a prescription id from its "Recommended Tests" page, through cart, into checkout —
// checkout threads it to /orders/quote and /orders/checkout so the booking is forced onto the
// same lab the prescription was reviewed by (see OrdersService.priceOrder's prescriptionId
// branch). Plain localStorage, same convention as selectedCity.tsx: this is a single-tab-at-a-time
// intent, not shared state, so no context/provider is needed for it.
const STORAGE_KEY = "mdpathlabs_active_prescription_id";

export function setActivePrescriptionId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore — booking still works, it just won't force the same-lab continuity.
  }
}

export function getActivePrescriptionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearActivePrescriptionId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
