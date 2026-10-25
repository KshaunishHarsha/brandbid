export const VISITOR_COOKIE = 'bb_vid';
export const CONSENT_COOKIE = 'bb_consent';

export const UTM = { source: 'brandbid', mediumPromoter: 'promoter', mediumListing: 'listing' } as const;

/** Defaults only. The live values are in the `settings` table (BUILD section 6). */
export const DEFAULTS = {
  floorCents: 10,
  minBidCents: 1000,
  minWithdrawalCents: 1000,
  budgetShareBps: 5000,
  claimDays: 7,
  qualifySeconds: 10,
  cycleHours: 24,
  stagnationDays: 30,
  waitlistDays: 30,
} as const;

/** EU + EEA + UK: no visitor cookie or fingerprint without consent (D32, BUILD section 20). */
export const CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', // EU
  'IS', 'LI', 'NO', // EEA
  'GB', // UK
]);

export function needsConsent(country: string | null | undefined): boolean {
  return !!country && CONSENT_COUNTRIES.has(country.toUpperCase());
}

/** Handles nobody may take (BUILD section 10). Brand slugs are checked separately against the DB. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'brandbid', 'support', 'help', 'root', 'system', 'staff', 'team',
  'moderator', 'mod', 'official', 'security', 'billing', 'payments', 'noreply', 'info', 'null',
  'undefined', 'api', 'www', 'about', 'terms', 'privacy', 'earn', 'dash', 'go', 'out', 'me',
]);

/** Link-preview fetchers: served Open Graph HTML, never counted as clicks (BUILD section 13, A3). */
export const PREVIEW_FETCHER_UAS = [
  'Twitterbot', 'LinkedInBot', 'facebookexternalhit', 'Facebot', 'WhatsApp', 'Slackbot',
  'TelegramBot', 'Discordbot', 'SkypeUriPreview', 'Pinterestbot', 'redditbot', 'Applebot',
  'Googlebot', 'bingbot', 'Embedly',
] as const;

export function isPreviewFetcher(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return PREVIEW_FETCHER_UAS.some((name) => ua.includes(name.toLowerCase()));
}

/** The one place a promo link URL is built, so adding a short domain later is a one-line change. */
export function linkUrl(code: string, siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/go/${code}`;
}
