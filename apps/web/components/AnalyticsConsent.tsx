'use client';

import { useSyncExternalStore } from 'react';
import { ANALYTICS_CONSENT_KEY, setAnalyticsConsent } from '@/lib/analytics';

export function AnalyticsConsent() {
  const show = useSyncExternalStore(
    (notify) => {
      window.addEventListener('storage', notify);
      window.addEventListener('bb-analytics-consent', notify);
      return () => {
        window.removeEventListener('storage', notify);
        window.removeEventListener('bb-analytics-consent', notify);
      };
    },
    () =>
      !!process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === null,
    () => false,
  );

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  if (!show)
    return (
      <button
        type="button"
        className="fixed bottom-2 right-2 z-40 rounded bg-surface px-2 py-1 text-xs text-muted"
        onClick={() => {
          window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
          window.dispatchEvent(new Event('bb-analytics-consent'));
        }}
      >
        Analytics settings
      </button>
    );
  const choose = (accepted: boolean) => {
    setAnalyticsConsent(accepted);
  };
  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-xl border border-line bg-surface p-4 shadow-xl"
      aria-label="Analytics choice"
    >
      <p className="text-sm">
        May we use optional analytics to improve the listing flow? Your choice does not affect
        payments or your listing.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
          onClick={() => choose(true)}
        >
          Allow analytics
        </button>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-sm"
          onClick={() => choose(false)}
        >
          No thanks
        </button>
      </div>
    </aside>
  );
}
