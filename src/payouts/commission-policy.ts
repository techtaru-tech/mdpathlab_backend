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

export type CommissionLineInput = { name: string; itemType: string; priceRupees: number; ratePercent: number | string | { toString(): string } };
export type CommissionLine = { name: string; itemType: string; priceRupees: number; discountRupees: number; baseRupees: number; ratePercent: number; amountPaise: number };

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
    return { name: l.name, itemType: l.itemType, priceRupees: price, discountRupees: share, baseRupees: base, ratePercent: rateToBasisPoints(l.ratePercent) / 100, amountPaise: commissionPaise(base, l.ratePercent) };
  });
  return { amountPaise: out.reduce((a, l) => a + l.amountPaise, 0), baseRupees: out.reduce((a, l) => a + l.baseRupees, 0), lines: out };
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
