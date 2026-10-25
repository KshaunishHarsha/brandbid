'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { captureListingEvent } from '@/lib/analytics';

export function PromoterProfileForm({ next, initialHandle, initialCountry, countries }: {
  next: string;
  initialHandle: string;
  initialCountry: string;
  countries: Array<{ code: string; name: string }>;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const [country, setCountry] = useState(initialCountry);
  const [accepted, setAccepted] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/promoter/handle?handle=${encodeURIComponent(handle)}`, { signal: controller.signal });
        if (res.ok) setAvailable((await res.json()).available === true);
      } catch { /* The submit route checks again. */ }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [handle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/promoter/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, country, acceptTerms: accepted, next }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error === 'handle_taken' ? 'That handle is taken or reserved.' : 'Could not save your profile. Check the fields and try again.');
      else {
        captureListingEvent('promoter_profile_completed');
        window.location.assign(data.next);
      }
    } catch { setError('Network error. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <h1 className="text-2xl font-bold">Set up your promoter profile</h1>
      <p className="text-sm text-muted">Choose a public handle, your country, and accept the promoter terms. Payout details come later.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="handle" className="block text-sm font-medium">Handle</label>
          <input id="handle" required minLength={3} maxLength={20} pattern="[a-z0-9_]+" autoComplete="off" value={handle}
            onChange={(e) => { setHandle(e.target.value.trim().toLowerCase()); setAvailable(null); }}
            className="mt-1 w-full rounded-lg border border-line bg-surface p-3" />
          {available !== null && <p className="mt-1 text-xs">{available ? 'Available' : 'Taken or reserved'}</p>}
        </div>
        <div>
          <label htmlFor="country" className="block text-sm font-medium">Country</label>
          <select id="country" required value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface p-3">
            <option value="">Choose your country</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
          <span>I agree to the <Link href="/terms/promoter" target="_blank" className="underline">promoter terms</Link>.</span>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button disabled={busy || available === false} className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-50">{busy ? 'Saving…' : 'Continue to sharing'}</button>
      </form>
    </main>
  );
}
