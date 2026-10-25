// UTM tagging for outbound clicks (BUILD section 13 step D). Brands see brandbid traffic in their own
// analytics without installing anything. Listing traffic and promoter traffic use the same helper.

export type UtmParams = {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
};

export const UTM_SOURCE = 'brandbid';

/**
 * Add UTM parameters to a URL. Existing query parameters (and the #fragment) are kept; any existing
 * utm_* values we are setting are replaced so the brand's analytics attributes the visit to brandbid.
 * Throws on a URL that cannot be parsed.
 */
export function addUtm(input: string, utm: UtmParams): string {
  const url = new URL(input);
  url.searchParams.set('utm_source', utm.source);
  url.searchParams.set('utm_medium', utm.medium);
  if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
  if (utm.content) url.searchParams.set('utm_content', utm.content);
  return url.toString();
}

/** Organic visit from the brand's page or the leaderboard (no promoter involved). */
export function listingUtm(input: string): string {
  return addUtm(input, { source: UTM_SOURCE, medium: 'listing' });
}
