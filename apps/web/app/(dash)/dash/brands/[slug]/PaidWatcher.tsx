'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// After paying, the bid is recorded by the payment webhook a few seconds later. Re-read the page until the total
// changes (or give up after 40 s), so the owner sees the new rank without reloading.
export function PaidWatcher({ slug, totalPaidCents }: { slug: string; totalPaidCents: number }) {
  const router = useRouter();
  const [baseline] = useState(totalPaidCents); // the total when the page first loaded after paying
  const [slow, setSlow] = useState(false);
  const changed = totalPaidCents !== baseline;

  useEffect(() => {
    if (changed) {
      const t = setTimeout(() => router.replace(`/dash/brands/${slug}`), 4000);
      return () => clearTimeout(t);
    }
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 40_000) {
        clearInterval(id);
        setSlow(true);
      } else router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [changed, router, slug]);

  const text = changed
    ? 'Payment received. Your total and rank are updated.'
    : slow
      ? 'Still waiting for the payment to arrive. Refresh in a minute; if you were charged and nothing changes, contact support.'
      : 'Payment received. Updating your rank…';
  return <p role="status" className="rounded-lg border border-positive/50 bg-positive/10 p-3 text-sm">{text}</p>;
}
