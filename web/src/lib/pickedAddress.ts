import type { PickedAddress } from "@/components/LocationPickerDialog";

type AddressFields = { line1: string; city: string; pincode: string };
export type AutoFilled = Partial<AddressFields>;

const KEYS = ["line1", "city", "pincode"] as const;

/**
 * Applies a map/GPS-picked address to the address form. A field is (re)filled when it's empty or
 * still exactly what the map filled in last time — so moving the pin updates the address, but
 * anything the patient typed themselves (e.g. a flat number) is never overwritten.
 * Returns the next form state plus what was auto-filled, to pass back in on the next pick.
 */
export function mergePickedAddress<T extends AddressFields>(
  current: T,
  picked: PickedAddress | undefined,
  lastAutoFilled: AutoFilled,
): { next: T; autoFilled: AutoFilled } {
  const next = { ...current };
  const autoFilled: AutoFilled = {};

  for (const key of KEYS) {
    const value = key === "pincode" ? picked?.pincode?.replace(/\D/g, "").slice(0, 6) : picked?.[key]?.trim();
    const untouched = !current[key].trim() || current[key] === lastAutoFilled[key];
    if (value && untouched) {
      next[key] = value;
      autoFilled[key] = value;
    } else if (untouched && lastAutoFilled[key] !== undefined) {
      autoFilled[key] = lastAutoFilled[key];
    }
  }
  return { next, autoFilled };
}
