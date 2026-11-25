/**
 * Additional collection charge by distance (straight line from the lab's map pin to the patient's address pin).
 * Admin sets any number of rules, e.g. "above 5 km → ₹60, above 10 km → ₹150, above 20 km → ₹250": the rule with
 * the highest distance the address is beyond applies. Up to the lowest distance it is free.
 * Stored in SiteSetting.collectionChargeTiers; the older single rule (farCollectionKm / farCollectionCharge) is the
 * fallback and is kept equal to the first rule for older app versions.
 */
export type ChargeTier = { aboveKm: number; charge: number };

type TierSettings = { collectionChargeTiers?: unknown; farCollectionKm: number; farCollectionCharge: number };

export const MAX_TIERS = 10;

/** Valid rules, lowest distance first. Falls back to the single farCollectionKm / farCollectionCharge rule. */
export function chargeTiers(s: TierSettings): ChargeTier[] {
  const raw = s.collectionChargeTiers;
  if (Array.isArray(raw)) {
    const tiers = raw
      .map((t) => ({ aboveKm: Number((t as ChargeTier)?.aboveKm), charge: Number((t as ChargeTier)?.charge) }))
      .filter((t) => Number.isFinite(t.aboveKm) && t.aboveKm >= 0 && Number.isInteger(t.charge) && t.charge >= 0)
      .sort((a, b) => a.aboveKm - b.aboveKm);
    if (tiers.length) return tiers;
    if (raw.length === 0) return []; // admin removed every rule: never charge
  }
  return [{ aboveKm: s.farCollectionKm, charge: s.farCollectionCharge }];
}

/** The rule that applies at this distance (null = free / no distance). */
export function tierFor(tiers: ChargeTier[], distanceKm: number | null): ChargeTier | null {
  if (distanceKm === null) return null;
  let hit: ChargeTier | null = null;
  for (const t of tiers) if (distanceKm > t.aboveKm) hit = t;
  return hit;
}

/** Normalises rules from admin: sorted, distances unique. Throws a readable message for bad input. */
export function cleanTiers(input: unknown): ChargeTier[] {
  if (!Array.isArray(input)) throw new Error('Send the rules as a list');
  if (input.length > MAX_TIERS) throw new Error(`At most ${MAX_TIERS} distance rules`);
  const tiers = input.map((t, i) => {
    const aboveKm = Number((t as ChargeTier)?.aboveKm);
    const charge = Number((t as ChargeTier)?.charge);
    if (!Number.isFinite(aboveKm) || aboveKm < 0 || aboveKm > 500) throw new Error(`Rule ${i + 1}: distance must be between 0 and 500 km`);
    if (!Number.isInteger(charge) || charge < 0 || charge > 10000) throw new Error(`Rule ${i + 1}: charge must be a whole amount from ₹0 to ₹10000`);
    return { aboveKm: Math.round(aboveKm * 10) / 10, charge };
  });
  tiers.sort((a, b) => a.aboveKm - b.aboveKm);
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.aboveKm === tiers[i - 1]!.aboveKm) throw new Error(`Two rules use ${tiers[i]!.aboveKm} km — each distance only once`);
  }
  return tiers;
}
