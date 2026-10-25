import posthog from 'posthog-js';

export const ANALYTICS_CONSENT_KEY = 'bb_analytics_consent';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function initAnalytics(): void {
  if (!key || typeof window === 'undefined') return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: 'history_change',
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
  });
  if (window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'yes') {
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.capture('$pageview');
  }
}

export function captureListingEvent(
  event: 'list_started' | 'list_prefilled' | 'checkout_started' | 'bid_succeeded',
  properties?: Record<string, string | number | boolean>,
): void {
  if (!key || typeof window === 'undefined') return;
  if (window.localStorage.getItem(ANALYTICS_CONSENT_KEY) !== 'yes') return;
  posthog.capture(event, properties);
}

export function setAnalyticsConsent(accepted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, accepted ? 'yes' : 'no');
  window.dispatchEvent(new Event('bb-analytics-consent'));
  if (!key) return;
  if (accepted) {
    posthog.opt_in_capturing({ captureEventName: false });
    posthog.capture('$pageview');
  } else {
    posthog.opt_out_capturing();
  }
}
