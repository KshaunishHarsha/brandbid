import posthog from 'posthog-js';

export const ANALYTICS_CONSENT_KEY = 'bb_analytics_consent';
const ANALYTICS_IDENTITY_KEY = 'bb_analytics_user_id';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function isConfigured(): boolean {
  if (key && host) return true;
  if (process.env.NODE_ENV === 'development') {
    const variable = key ? 'NEXT_PUBLIC_POSTHOG_HOST' : 'NEXT_PUBLIC_POSTHOG_KEY';
    console.warn(`[analytics] ${variable} is not configured; optional analytics events are disabled.`);
  }
  return false;
}

function getStoredValue(name: string): string | null | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(name);
  } catch {
    return undefined;
  }
}

function setStoredValue(name: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(name, value);
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(name);
  } catch {
    // Storage may be disabled; analytics must remain best-effort.
  }
}

export function hasAnalyticsConsent(): boolean {
  return getStoredValue(ANALYTICS_CONSENT_KEY) === 'yes';
}

export function isAnalyticsConsentPending(): boolean {
  return getStoredValue(ANALYTICS_CONSENT_KEY) === null;
}

export function clearAnalyticsConsent(): void {
  removeStoredValue(ANALYTICS_CONSENT_KEY);
}

export function initAnalytics(): void {
  if (typeof window === 'undefined' || !isConfigured()) return;
  posthog.init(key!, {
    api_host: host!,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    tracing_headers: [window.location.hostname],
  });
  if (hasAnalyticsConsent()) {
    posthog.opt_in_capturing({ captureEventName: false });
  } else {
    posthog.opt_out_capturing();
  }
}

export function captureListingEvent(
  event:
    | 'list_started'
    | 'list_prefilled'
    | 'checkout_started'
    | 'bid_succeeded'
    | 'magic_link_requested'
    | 'google_sign_in_started'
    | 'promoter_profile_completed'
    | 'beta_waitlist_joined'
    | 'rerank_checkout_started',
  properties?: Record<string, string | number | boolean>,
): void {
  if (!key || !host || typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  posthog.capture(event, properties);
}

export function identifyAnalyticsUser(userId: string): void {
  if (!key || !host || typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  if (getStoredValue(ANALYTICS_IDENTITY_KEY) === userId) return;

  posthog.identify(userId);
  setStoredValue(ANALYTICS_IDENTITY_KEY, userId);
}

export function resetAnalyticsUser(): void {
  if (typeof window === 'undefined') return;
  removeStoredValue(ANALYTICS_IDENTITY_KEY);
  if (key && host) posthog.reset();
}

export function setAnalyticsConsent(accepted: boolean): void {
  if (typeof window === 'undefined') return;
  const saved = setStoredValue(ANALYTICS_CONSENT_KEY, accepted ? 'yes' : 'no');
  if (key && host) {
    if (accepted && saved) {
      posthog.opt_in_capturing({ captureEventName: false });
      posthog.capture('$pageview');
    } else {
      posthog.opt_out_capturing();
    }
  }
  window.dispatchEvent(new Event('bb-analytics-consent'));
}
