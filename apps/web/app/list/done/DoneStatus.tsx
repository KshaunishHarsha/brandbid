'use client';

import { useEffect, useRef, useState } from 'react';
import { captureListingEvent } from '@/lib/analytics';

type Status = {
  slug: string;
  status: 'draft' | 'pending_review' | 'active' | 'rejected' | 'removed';
  paid: boolean;
};

// Polls until the payment webhook has been processed and the automatic checks have run.
export function DoneStatus({ id, token }: { id: string; token: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (s?.paid && !recorded.current) {
      recorded.current = true;
      captureListingEvent('bid_succeeded');
    }
  }, [s?.paid]);

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    async function tick() {
      try {
        const res = await fetch(`/api/brands/status?id=${id}&t=${token}`, { cache: 'no-store' });
        if (res.ok && !stop) setS(await res.json());
      } catch {
        /* keep trying */
      }
      if (stop) return;
      if (Date.now() - started > 120_000) return setGaveUp(true);
      setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [id, token]);

  if (s?.status === 'active') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">You&apos;re live 🎉</h1>
        <p>Your brand is on the leaderboard.</p>
        <a
          className="inline-block rounded-lg bg-black px-4 py-3 text-white dark:bg-white dark:text-black"
          href={`/b/${s.slug}`}
        >
          View your page
        </a>
        <Email />
      </div>
    );
  }
  if (s?.status === 'rejected' || s?.status === 'removed') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">We couldn&apos;t list this brand</h1>
        <p>Your payment is being refunded in full. You&apos;ll get an email with the details.</p>
      </div>
    );
  }
  if (s?.status === 'pending_review') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Payment received</h1>
        <p>
          We&apos;re checking your listing. This usually takes under a minute, but some categories
          are reviewed by hand and can take longer. You don&apos;t need to wait here.
        </p>
        <Email />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">
        {gaveUp ? 'Still waiting for your payment' : 'Confirming your payment…'}
      </h1>
      <p className="text-sm opacity-70">
        {gaveUp
          ? 'If you paid, it can take a few more minutes to arrive. Check your email, or contact support if nothing shows up.'
          : 'This usually takes a few seconds.'}
      </p>
    </div>
  );
}

function Email() {
  return (
    <p className="text-sm opacity-70">
      We emailed you a one-click link to manage your listing. If it doesn&apos;t arrive, check spam
      or{' '}
      <a className="underline" href="/signin">
        request a new one
      </a>
      .
    </p>
  );
}
