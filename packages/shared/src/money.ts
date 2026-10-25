// Money helpers. All amounts are integer cents (BUILD section 7, rule 1). No floats.
// Cents are plain JS numbers: PostgREST returns bigint as number, and 2^53 cents is ~$90 trillion.

export type Cents = number & { readonly __brand: 'Cents' };

export function assertCents(n: unknown): asserts n is Cents {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new TypeError(`Not an integer number of cents: ${String(n)}`);
  }
}

export function cents(n: number): Cents {
  assertCents(n);
  return n;
}

const DOLLARS_RE = /^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

/** Parse a dollar string ("12", "12.5", "$1,234.50") into cents. Never goes through a float. */
export function toCents(dollars: string): Cents {
  const s = dollars.trim();
  if (!DOLLARS_RE.test(s)) throw new RangeError(`Invalid dollar amount: "${dollars}"`);
  const [whole = '0', frac = ''] = s.replace(/[$,]/g, '').split('.');
  return cents(Number(whole) * 100 + Number(frac.padEnd(2, '0')));
}

/** Format cents as "$1,234.50". */
export function formatUSD(value: number): string {
  assertCents(value);
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${whole}.${frac}`;
}

/** "$1,234" for whole dollars, "$1,234.50" otherwise. For boards, where "$1,000.00" is just noise. */
export function formatUSDCompact(value: number): string {
  const s = formatUSD(value);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

/**
 * Split a bid exactly like BUILD section 7 rule 7:
 *   budget  = floor(amount * budgetShareBps / 10000)
 *   revenue = amount - budget
 * BigInt avoids overflow on large amounts.
 */
export function splitBid(
  amountCents: number,
  budgetShareBps: number,
): { budgetCents: Cents; revenueCents: Cents } {
  assertCents(amountCents);
  if (amountCents <= 0) throw new RangeError('Bid amount must be positive');
  if (!Number.isInteger(budgetShareBps) || budgetShareBps < 0 || budgetShareBps > 10_000) {
    throw new RangeError('budgetShareBps must be an integer from 0 to 10000');
  }
  const budget = Number((BigInt(amountCents) * BigInt(budgetShareBps)) / 10_000n);
  return { budgetCents: cents(budget), revenueCents: cents(amountCents - budget) };
}

/** How many visitors a budget pays for at a rate (whole visitors only). */
export function visitorsAffordable(budgetCents: number, rateCents: number): number {
  assertCents(budgetCents);
  assertCents(rateCents);
  if (rateCents <= 0) throw new RangeError('Rate must be positive');
  return Math.floor(budgetCents / rateCents);
}
