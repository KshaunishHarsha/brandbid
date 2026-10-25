'use client';

import { useMemo, useState } from 'react';
import { formatUSD, toCents, visitorsAffordable } from '@brandbid/shared';

function centsInput(value: number) {
  return formatUSD(value).replace(/[$,]/g, '');
}

export function RateSetting({ slug, rateCents, floorCents, remainingCents }: {
  slug: string; rateCents: number; floorCents: number; remainingCents: number;
}) {
  const [rate, setRate] = useState(centsInput(rateCents));
  const estimate = useMemo(() => {
    try {
      const cents = toCents(rate);
      return cents > 0 ? visitorsAffordable(remainingCents, cents) : null;
    } catch {
      return null;
    }
  }, [rate, remainingCents]);

  return (
    <form method="post" action={`/api/brands/${encodeURIComponent(slug)}/edit`} className="mt-5 rounded-xl border border-line p-4">
      <label htmlFor="rate" className="block text-sm font-semibold">Rate per qualified visitor</label>
      <p className="mt-1 text-xs text-muted">The minimum rate is {formatUSD(floorCents)}.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">$</span>
          <input
            id="rate"
            name="rate"
            type="number"
            inputMode="decimal"
            min={centsInput(floorCents)}
            step="0.01"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            required
            className="w-28 rounded-lg border border-line bg-bg px-3 py-2"
          />
        </div>
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">Save rate</button>
      </div>
      <p className="mt-3 text-sm" aria-live="polite">
        Your remaining budget of {formatUSD(remainingCents)} pays for about <strong>{estimate ?? '—'}</strong> visitors at this rate.
      </p>
      <p className="mt-1 text-xs text-muted">A new rate applies to the next claim click. Visitors who already have a claim keep their claimed rate.</p>
    </form>
  );
}
