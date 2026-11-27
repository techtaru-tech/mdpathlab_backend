// Money rules for partner commission. Pure functions, integer arithmetic only: amounts are paise, rates are
// percentages with two decimals, handled as hundredths of a percent so no floating-point rounding creeps in.

/** "12.5" / 12.5 / Decimal("12.50") → 1250 (hundredths of a percent). */
export function rateToBasisPoints(rate: number | string | { toString(): string }): number {
  return Math.round(Number(rate.toString()) * 100);
}

/**
 * What a booking earns: the tests' price after discount (no home-collection fee, no wallet top-up), times the
 * rate, rounded down to the paisa. ₹1,599 at 10% → 15,990 paise (₹159.90).
 */
export function commissionPaise(baseRupees: number, ratePercent: number | string | { toString(): string }): number {
  if (baseRupees <= 0) return 0;
  return Math.floor((baseRupees * rateToBasisPoints(ratePercent)) / 100);
}

export type CommissionCategoryName = 'ROUTINE' | 'SPECIAL' | 'PACKAGE';
export const COMMISSION_CATEGORIES: CommissionCategoryName[] = ['ROUTINE', 'SPECIAL', 'PACKAGE'];

export type CommissionLineInput = {
  name: string;
  itemType: string;
  priceRupees: number;
  ratePercent: number | string | { toString(): string };
  category?: CommissionCategoryName | null;
};
export type CommissionLine = {
  name: string;
  itemType: string;
  category: CommissionCategoryName;
  priceRupees: number;
  discountRupees: number;
  baseRupees: number;
  ratePercent: number;
  amountPaise: number;
};

/** A package is always PACKAGE; anything else is what the admin marked it (ROUTINE when never marked). */
export function lineCategory(itemType: string, marked?: string | null): CommissionCategoryName {
  if (itemType === 'PACKAGE') return 'PACKAGE';
  return marked === 'SPECIAL' ? 'SPECIAL' : 'ROUTINE';
}

type Rate = number | string | { toString(): string };
export type MouRates = { id: string; routinePercent: Rate; specialPercent: Rate; packagePercent: Rate };

/**
 * The rate a booked line gets: the referring partner's MOU rate for its category when the partner has an MOU in
 * force for the booking; otherwise the test's own rate; otherwise the default.
 */
export function pickRate(category: CommissionCategoryName, mou: MouRates | null, itemRate: Rate | undefined, defaultRate: Rate): { ratePercent: Rate; source: 'MOU' | 'ITEM' | 'DEFAULT'; mouId: string | null } {
  if (mou) {
    const ratePercent = category === 'PACKAGE' ? mou.packagePercent : category === 'SPECIAL' ? mou.specialPercent : mou.routinePercent;
    return { ratePercent, source: 'MOU', mouId: mou.id };
  }
  if (itemRate !== undefined) return { ratePercent: itemRate, source: 'ITEM', mouId: null };
  return { ratePercent: defaultRate, source: 'DEFAULT', mouId: null };
}

/** The MOU in force at `at`: the latest one that had started by then and was not withdrawn. */
export function mouInForce<T extends { effectiveFrom: Date; withdrawnAt: Date | null }>(mous: T[], at: Date): T | null {
  let best: T | null = null;
  for (const m of mous) {
    if (m.withdrawnAt || m.effectiveFrom.getTime() > at.getTime()) continue;
    if (!best || m.effectiveFrom.getTime() > best.effectiveFrom.getTime()) best = m;
  }
  return best;
}

/**
 * Test-wise commission for one booking: each line earns its own rate on its price, after its share of the
 * booking's discount (split in proportion to price; whole rupees, the remainder on the last line, so the shares
 * add up to the discount exactly). Home-collection fee and wallet money never count.
 *   CBC ₹200 at 5% + Heart ₹600 at 15%, no discount → ₹10 + ₹90 = ₹100.
 */
export function orderCommission(lines: CommissionLineInput[], discountRupees: number): { amountPaise: number; baseRupees: number; lines: CommissionLine[] } {
  const total = lines.reduce((a, l) => a + Math.max(0, l.priceRupees), 0);
  const discount = Math.min(Math.max(0, discountRupees), total);
  let allocated = 0;
  const out = lines.map((l, i) => {
    const price = Math.max(0, l.priceRupees);
    const share = i === lines.length - 1 ? discount - allocated : total > 0 ? Math.floor((discount * price) / total) : 0;
    allocated += share;
    const base = Math.max(0, price - share);
    return {
      name: l.name,
      itemType: l.itemType,
      category: lineCategory(l.itemType, l.category),
      priceRupees: price,
      discountRupees: share,
      baseRupees: base,
      ratePercent: rateToBasisPoints(l.ratePercent) / 100,
      amountPaise: commissionPaise(base, l.ratePercent),
    };
  });
  return { amountPaise: out.reduce((a, l) => a + l.amountPaise, 0), baseRupees: out.reduce((a, l) => a + l.baseRupees, 0), lines: out };
}

/**
 * How much of an earning should be reversed in total. Cancelled or fully refunded: all of it. Partly refunded: the
 * commission now applies to the eligible amount minus the refund, so ₹2,000 at 15% (₹300) with ₹500 refunded keeps
 * ₹1,500 × 15% = ₹225 and reverses ₹75. Rounded so the partner is never left with more than the reduced amount.
 */
export function reversalTargetPaise(earnedPaise: number, baseRupees: number, refundedPaise: number, fully: boolean): number {
  if (earnedPaise <= 0) return 0;
  if (fully || baseRupees <= 0) return earnedPaise;
  const basePaise = baseRupees * 100;
  const left = Math.max(0, basePaise - Math.max(0, refundedPaise));
  const keep = Math.floor((earnedPaise * left) / basePaise);
  return earnedPaise - keep;
}

export type BreakdownLike = { category?: string | null; itemType?: string; amountPaise: number; name?: string };

/** A cumulative reversal total split over the earning's lines in proportion (remainder on the last line). */
function allocate(lines: BreakdownLike[], earnedPaise: number, totalPaise: number): number[] {
  let used = 0;
  return lines.map((l, i) => {
    const share = i === lines.length - 1 ? totalPaise - used : Math.floor((totalPaise * Math.max(0, l.amountPaise)) / earnedPaise);
    used += share;
    return share;
  });
}

/**
 * The per-line split of a reversal step that takes the reversed total from `fromPaise` to `toPaise`. Worked out as
 * the split of the new total minus the split of the old one, so however many steps there are, a full reversal always
 * brings every line — and every category — back to exactly zero. Returned amounts are negative.
 */
export function reversalBreakdown(
  lines: BreakdownLike[],
  earnedPaise: number,
  fromPaise: number,
  toPaise: number,
): { name: string; itemType: string; category: CommissionCategoryName; amountPaise: number }[] {
  if (lines.length === 0 || earnedPaise <= 0) return [];
  const before = allocate(lines, earnedPaise, fromPaise);
  const after = allocate(lines, earnedPaise, toPaise);
  return lines.map((l, i) => ({
    name: l.name ?? '',
    itemType: l.itemType ?? '',
    category: lineCategory(l.itemType ?? '', l.category),
    amountPaise: -(after[i]! - before[i]!),
  }));
}

/** Net commission per category over earnings and reversals (each row's breakdown). */
export function categoryTotals(entries: { breakdown: unknown }[]): Record<CommissionCategoryName, number> {
  const out: Record<CommissionCategoryName, number> = { ROUTINE: 0, SPECIAL: 0, PACKAGE: 0 };
  for (const e of entries) {
    if (!Array.isArray(e.breakdown)) continue;
    for (const l of e.breakdown as BreakdownLike[]) {
      if (typeof l?.amountPaise !== 'number') continue;
      out[lineCategory(l.itemType ?? '', l.category)] += l.amountPaise;
    }
  }
  return out;
}

/** TDS on a payout, rounded to the nearest paisa. */
export function tdsPaise(amountPaise: number, tdsPercent: number | string | { toString(): string }): number {
  return Math.round((amountPaise * rateToBasisPoints(tdsPercent)) / 10_000);
}

export type LedgerTotals = {
  /** Everything ever earned (before reversals). */
  earnedPaise: number;
  reversedPaise: number;
  adjustmentsPaise: number;
  /** Earnings still inside the hold period. */
  pendingPaise: number;
  /** Sum of every row — what the partner is owed, including what's still on hold. */
  balancePaise: number;
  /** What can be withdrawn now (may be negative after a reversal). */
  availablePaise: number;
};

export function ledgerTotals(byType: Partial<Record<string, number>>, pendingPaise: number): LedgerTotals {
  const sum = (t: string) => byType[t] ?? 0;
  const balancePaise = Object.values(byType).reduce<number>((a, b) => a + (b ?? 0), 0);
  return {
    earnedPaise: sum('EARNING'),
    reversedPaise: -sum('REVERSAL'),
    adjustmentsPaise: sum('ADJUSTMENT'),
    pendingPaise,
    balancePaise,
    availablePaise: balancePaise - pendingPaise,
  };
}

/** Why a withdrawal can't be made right now, or null if it can. */
export function withdrawalBlocker(input: {
  enabled: boolean;
  partnerApproved: boolean;
  hasBankAccount: boolean;
  hasOpenWithdrawal: boolean;
  availablePaise: number;
  amountPaise: number;
  minWithdrawalRupees: number;
}): string | null {
  if (!input.enabled) return 'Withdrawals are not open at the moment';
  if (!input.partnerApproved) return 'Only an approved account can withdraw';
  if (!input.hasBankAccount) return 'Add your bank account first';
  if (input.hasOpenWithdrawal) return 'You already have a withdrawal in progress';
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) return 'Enter a valid amount';
  const min = input.minWithdrawalRupees * 100;
  if (input.amountPaise < min) return `The minimum withdrawal is ₹${input.minWithdrawalRupees.toLocaleString('en-IN')}`;
  if (input.amountPaise > input.availablePaise) return 'That is more than your available balance';
  return null;
}
