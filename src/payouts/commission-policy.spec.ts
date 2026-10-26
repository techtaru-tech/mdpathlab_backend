import { commissionPaise, ledgerTotals, orderCommission, rateToBasisPoints, tdsPaise, withdrawalBlocker } from './commission-policy';

describe('test-wise commission for a booking', () => {
  it("each test earns its own rate: CBC ₹200 at 5% + Heart ₹600 at 15% = ₹100", () => {
    const r = orderCommission(
      [
        { name: 'CBC', itemType: 'PARAMETER', priceRupees: 200, ratePercent: 5 },
        { name: 'Heart profile', itemType: 'PROFILE', priceRupees: 600, ratePercent: 15 },
      ],
      0,
    );
    expect(r.amountPaise).toBe(10_000);
    expect(r.lines.map((l) => l.amountPaise)).toEqual([1000, 9000]);
  });

  it('a discount is shared in proportion to price, and the shares add up exactly', () => {
    const r = orderCommission(
      [
        { name: 'A', itemType: 'PARAMETER', priceRupees: 200, ratePercent: 5 },
        { name: 'B', itemType: 'PROFILE', priceRupees: 600, ratePercent: 15 },
        { name: 'C', itemType: 'PARAMETER', priceRupees: 333, ratePercent: 10 },
      ],
      101,
    );
    expect(r.lines.reduce((a, l) => a + l.discountRupees, 0)).toBe(101);
    expect(r.lines[0]).toMatchObject({ discountRupees: 17, baseRupees: 183, amountPaise: 915 });
    expect(r.lines[1]).toMatchObject({ discountRupees: 53, baseRupees: 547, amountPaise: 8205 });
    expect(r.lines[2]).toMatchObject({ discountRupees: 31, baseRupees: 302, amountPaise: 3020 });
    expect(r.baseRupees).toBe(1032);
  });

  it('a test at 0% earns nothing; a discount larger than the bill never goes negative', () => {
    expect(orderCommission([{ name: 'X', itemType: 'PARAMETER', priceRupees: 500, ratePercent: 0 }], 0).amountPaise).toBe(0);
    const r = orderCommission([{ name: 'X', itemType: 'PARAMETER', priceRupees: 500, ratePercent: 10 }], 900);
    expect(r).toMatchObject({ amountPaise: 0, baseRupees: 0 });
    expect(orderCommission([], 0).amountPaise).toBe(0);
  });
});

describe('commission maths (integer paise, no float drift)', () => {
  it('rates are handled as hundredths of a percent', () => {
    expect(rateToBasisPoints('12.5')).toBe(1250);
    expect(rateToBasisPoints(0.1)).toBe(10);
    expect(rateToBasisPoints({ toString: () => '7.35' })).toBe(735);
  });

  it('earning = price after discount × rate, rounded down to the paisa', () => {
    expect(commissionPaise(1599, 10)).toBe(15_990); // ₹159.90
    expect(commissionPaise(999, '7.5')).toBe(7492); // ₹74.925 → ₹74.92
    expect(commissionPaise(0, 10)).toBe(0);
    expect(commissionPaise(-50, 10)).toBe(0);
    expect(commissionPaise(1599, 0)).toBe(0);
  });

  it('TDS rounds to the nearest paisa', () => {
    expect(tdsPaise(500_000, 2)).toBe(10_000); // 2% of ₹5,000 = ₹100
    expect(tdsPaise(123_457, '5')).toBe(6173);
    expect(tdsPaise(500_000, 0)).toBe(0);
  });

  it('balance = every row; available = balance − earnings still on hold', () => {
    const t = ledgerTotals({ EARNING: 900_000, REVERSAL: -100_000, WITHDRAWAL: -500_000, WITHDRAWAL_RETURNED: 200_000, ADJUSTMENT: -50_000 }, 150_000);
    expect(t).toEqual({ earnedPaise: 900_000, reversedPaise: 100_000, adjustmentsPaise: -50_000, pendingPaise: 150_000, balancePaise: 450_000, availablePaise: 300_000 });
  });
});

describe('who may withdraw how much', () => {
  const ok = { enabled: true, partnerApproved: true, hasBankAccount: true, hasOpenWithdrawal: false, availablePaise: 600_000, amountPaise: 500_000, minWithdrawalRupees: 5000 };

  it('allows an approved partner with a bank account, at or above the minimum, within the balance', () => {
    expect(withdrawalBlocker(ok)).toBeNull();
    expect(withdrawalBlocker({ ...ok, amountPaise: 600_000 })).toBeNull();
  });

  it.each([
    [{ enabled: false }, 'not open'],
    [{ partnerApproved: false }, 'approved'],
    [{ hasBankAccount: false }, 'bank account'],
    [{ hasOpenWithdrawal: true }, 'in progress'],
    [{ amountPaise: 499_900 }, 'minimum withdrawal is ₹5,000'],
    [{ amountPaise: 600_100 }, 'more than your available'],
    [{ availablePaise: -10_000, amountPaise: 500_000 }, 'more than your available'],
    [{ amountPaise: 0 }, 'valid amount'],
    [{ amountPaise: -500_000 }, 'valid amount'],
    [{ amountPaise: 500_000.5 }, 'valid amount'],
  ])('refuses %j', (change, message) => {
    expect(withdrawalBlocker({ ...ok, ...change })).toContain(message);
  });

  it('the minimum is whatever the admin set', () => {
    expect(withdrawalBlocker({ ...ok, minWithdrawalRupees: 10_000 })).toContain('₹10,000');
    expect(withdrawalBlocker({ ...ok, minWithdrawalRupees: 1000, amountPaise: 100_000 })).toBeNull();
  });
});
