import { chargeTiers, cleanTiers, tierFor } from './collection-charge-tiers.js';

const tiers = [
  { aboveKm: 5, charge: 60 },
  { aboveKm: 10, charge: 150 },
  { aboveKm: 20, charge: 250 },
];

describe('collection charge tiers', () => {
  it('applies the highest rule the distance is beyond', () => {
    expect(tierFor(tiers, 3)).toBeNull();
    expect(tierFor(tiers, 5)).toBeNull(); // exactly 5 km is still free
    expect(tierFor(tiers, 5.1)?.charge).toBe(60);
    expect(tierFor(tiers, 10)?.charge).toBe(60);
    expect(tierFor(tiers, 12)?.charge).toBe(150);
    expect(tierFor(tiers, 35)?.charge).toBe(250);
    expect(tierFor(tiers, null)).toBeNull();
  });

  it('reads stored rules, falling back to the single old rule', () => {
    expect(chargeTiers({ collectionChargeTiers: null, farCollectionKm: 5, farCollectionCharge: 60 })).toEqual([{ aboveKm: 5, charge: 60 }]);
    expect(chargeTiers({ collectionChargeTiers: [{ aboveKm: 10, charge: 150 }, { aboveKm: 5, charge: 60 }], farCollectionKm: 1, farCollectionCharge: 1 })).toEqual([
      { aboveKm: 5, charge: 60 },
      { aboveKm: 10, charge: 150 },
    ]);
    expect(chargeTiers({ collectionChargeTiers: [], farCollectionKm: 5, farCollectionCharge: 60 })).toEqual([]);
  });

  it('cleans admin input and rejects bad rules', () => {
    expect(cleanTiers([{ aboveKm: 20, charge: 250 }, { aboveKm: 5, charge: 60 }])).toEqual([
      { aboveKm: 5, charge: 60 },
      { aboveKm: 20, charge: 250 },
    ]);
    expect(() => cleanTiers([{ aboveKm: 5, charge: 60 }, { aboveKm: 5, charge: 90 }])).toThrow(/each distance only once/);
    expect(() => cleanTiers([{ aboveKm: -1, charge: 60 }])).toThrow(/distance/);
    expect(() => cleanTiers([{ aboveKm: 5, charge: 6.5 }])).toThrow(/charge/);
  });
});
