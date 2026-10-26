// Same list as src/partners/medical-councils.ts on the API (which refuses anything else); keep the two in step.
export const MEDICAL_COUNCILS = [
  "National Medical Commission",
  "Andhra Pradesh Medical Council",
  "Arunachal Pradesh Medical Council",
  "Assam Medical Council",
  "Bihar Medical Council",
  "Chhattisgarh Medical Council",
  "Delhi Medical Council",
  "Goa Medical Council",
  "Gujarat Medical Council",
  "Haryana Medical Council",
  "Himachal Pradesh Medical Council",
  "Jammu and Kashmir Medical Council",
  "Jharkhand Medical Council",
  "Karnataka Medical Council",
  "Travancore Cochin Medical Council",
  "Madhya Pradesh Medical Council",
  "Maharashtra Medical Council",
  "Manipur Medical Council",
  "Meghalaya Medical Council",
  "Mizoram Medical Council",
  "Nagaland Medical Council",
  "Odisha Council of Medical Registration",
  "Puducherry Medical Council",
  "Punjab Medical Council",
  "Rajasthan Medical Council",
  "Sikkim Medical Council",
  "Tamil Nadu Medical Council",
  "Telangana State Medical Council",
  "Tripura State Medical Council",
  "Uttar Pradesh Medical Council",
  "Uttarakhand Medical Council",
  "West Bengal Medical Council",
] as const;

/** The API stores councils upper-case; this finds the list entry for a saved value ("" if it isn't one). */
export function matchCouncil(saved: string | null | undefined): string {
  const upper = (saved ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return MEDICAL_COUNCILS.find((c) => c.toUpperCase() === upper) ?? "";
}
