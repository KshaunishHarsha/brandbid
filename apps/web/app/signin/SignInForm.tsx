'use client';

import { useCallback, useState } from 'react';
import { Turnstile } from '@/components/Turnstile';
import { captureListingEvent } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';

type State = 'idle' | 'sending' | 'sent' | 'error';

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const googleOn = process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'true';
  const needsBotCheck = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: token ?? undefined, next }),
      });
      if (res.ok) {
        captureListingEvent('magic_link_requested');
        return setState('sent');
      }
      setState('error');
      setMessage(
        res.status === 429
          ? 'Too many attempts. Try again in a few minutes.'
          : res.status === 400
            ? 'Check the email address and try again.'
            : 'Something went wrong. Try again.',
      );
    } catch {
      setState('error');
      setMessage('Network error. Try again.');
    }
  }

  async function google() {
    captureListingEvent('google_sign_in_started');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  if (state === 'sent') {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm opacity-70">
          We sent a sign-in link to <strong>{email}</strong>. It works once and expires in an hour.
        </p>
        <button className="text-sm underline" onClick={() => setState('idle')}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {googleOn && (
        <>
          <button
            type="button"
            onClick={google}
            className="w-full rounded-lg border border-black/20 px-4 py-3 font-medium dark:border-white/30"
          >
            Continue with Google
          </button>
          <div className="text-center text-xs opacity-50">or</div>
        </>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-black/20 bg-transparent px-3 py-3 dark:border-white/30"
        />
        <Turnstile onToken={onToken} />
        <button
          type="submit"
          disabled={state === 'sending' || (needsBotCheck && !token)}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        {state === 'error' && <p className="text-sm text-red-600">{message}</p>}
      </form>
    </div>
  );
}
