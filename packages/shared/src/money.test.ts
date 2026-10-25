import { describe, expect, it } from 'vitest';
import { assertCents, cents, formatUSD, formatUSDCompact, splitBid, toCents, visitorsAffordable } from './money';

describe('toCents', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['0.1', 10],
    ['0.10', 10],
    ['12.34', 1234],
    ['$1,234.50', 123450],
    ['  5  ', 500],
    ['1000000', 100000000],
  ])('parses %s', (input, expected) => expect(toCents(input)).toBe(expected));

  it.each(['', 'abc', '1.234', '-5', '1e3', '1,23', '.5', '1.', '$', '1,2345'])(
    'rejects %j',
    (input) => expect(() => toCents(input)).toThrow(RangeError),
  );

  it('is exact where floats are not (0.07 * 100 !== 7)', () => {
    expect(toCents('0.07')).toBe(7);
    expect(toCents('1.15')).toBe(115);
  });
});

describe('assertCents / cents', () => {
  it('accepts safe integers', () => {
    expect(cents(0)).toBe(0);
    expect(cents(-5)).toBe(-5);
  });
  it.each([1.5, NaN, Infinity, 2 ** 53, '5', null, undefined])('rejects %j', (v) => {
    expect(() => assertCents(v)).toThrow(TypeError);
  });
});

describe('formatUSD', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [10, '$0.10'],
    [100, '$1.00'],
    [123450, '$1,234.50'],
    [100000000, '$1,000,000.00'],
    [-250, '-$2.50'],
  ])('formats %d', (c, expected) => expect(formatUSD(c)).toBe(expected));
  it('rejects non-integers', () => expect(() => formatUSD(1.5)).toThrow(TypeError));
});

describe('formatUSDCompact', () => {
  it.each([
    [0, '$0'],
    [100, '$1'],
    [2500, '$25'],
    [2550, '$25.50'],
    [5, '$0.05'],
    [123400, '$1,234'],
    [123450, '$1,234.50'],
    [-250, '-$2.50'],
  ])('formats %d', (c, expected) => expect(formatUSDCompact(c)).toBe(expected));
});

describe('splitBid (BUILD s7 rule 7)', () => {
  it('splits 50/50', () => {
    expect(splitBid(1000, 5000)).toEqual({ budgetCents: 500, revenueCents: 500 });
  });
  it('floors the budget, so the odd cent goes to revenue', () => {
    expect(splitBid(1001, 5000)).toEqual({ budgetCents: 500, revenueCents: 501 });
    expect(splitBid(1, 5000)).toEqual({ budgetCents: 0, revenueCents: 1 });
    expect(splitBid(3, 5000)).toEqual({ budgetCents: 1, revenueCents: 2 });
  });
  it('always sums back to the amount', () => {
    for (const amount of [1, 7, 99, 1000, 123457, 999_999_999_999]) {
      for (const bps of [0, 1, 3333, 5000, 9999, 10000]) {
        const { budgetCents, revenueCents } = splitBid(amount, bps);
        expect(budgetCents + revenueCents).toBe(amount);
        expect(budgetCents).toBeGreaterThanOrEqual(0);
        expect(revenueCents).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('does not overflow on very large amounts', () => {
    const { budgetCents } = splitBid(900_000_000_000_000, 5000);
    expect(budgetCents).toBe(450_000_000_000_000);
  });
  it('honours other shares', () => {
    expect(splitBid(1000, 0)).toEqual({ budgetCents: 0, revenueCents: 1000 });
    expect(splitBid(1000, 10000)).toEqual({ budgetCents: 1000, revenueCents: 0 });
    expect(splitBid(1000, 3333)).toEqual({ budgetCents: 333, revenueCents: 667 });
  });
  it.each([0, -1])('rejects amount %d', (a) => expect(() => splitBid(a, 5000)).toThrow(RangeError));
  it.each([-1, 10001, 1.5])('rejects bps %d', (b) => expect(() => splitBid(100, b)).toThrow(RangeError));
  it('rejects non-integer amounts', () => expect(() => splitBid(10.5, 5000)).toThrow(TypeError));
});

describe('visitorsAffordable', () => {
  it('floors', () => {
    expect(visitorsAffordable(1000, 10)).toBe(100);
    expect(visitorsAffordable(1005, 10)).toBe(100);
    expect(visitorsAffordable(9, 10)).toBe(0);
  });
  it('rejects a non-positive rate', () => {
    expect(() => visitorsAffordable(100, 0)).toThrow(RangeError);
  });
});
