'use client';

import { useState } from 'react';
import { captureListingEvent } from '@/lib/analytics';

export function JoinWaitlist() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  async function join() {
    setState('busy');
    try {
      const res = await fetch('/api/beta/waitlist', { method: 'POST' });
      if (res.ok) captureListingEvent('beta_waitlist_joined');
      setState(res.ok ? 'done' : 'error');
    } catch { setState('error'); }
  }
  if (state === 'done') return <p role="status">You&apos;re on the waitlist.</p>;
  return <div><button onClick={join} disabled={state === 'busy'} className="rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-50">{state === 'busy' ? 'Joining…' : 'Join the waitlist'}</button>{state === 'error' && <p role="alert" className="mt-2 text-sm text-danger">Could not join. Try again shortly.</p>}</div>;
}
