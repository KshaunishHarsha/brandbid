// The automatic checks run on a freshly paid listing (BUILD section 8 step 5). Pure: the worker does the
// network probe and passes the result in, so every rule is unit-testable.
import { bareHost, parseSafeUrl } from './ssrf';

export type ListingFacts = {
  name: string;
  description: string | null;
  url: string;
  categoryRequiresReview: boolean;
};
export type ListingSettings = { blockedDomains: string[]; bannedWords: string[] };
export type UrlProbe = { ok: boolean };
export type ListingDecision = { outcome: 'approve' | 'hold'; reasons: string[] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchesBlockedDomain(host: string, blocked: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return blocked.some((d) => {
    const b = d.trim().toLowerCase().replace(/^www\./, '');
    return b !== '' && (h === b || h.endsWith(`.${b}`));
  });
}

export function findBannedWord(text: string, banned: string[]): string | null {
  for (const w of banned) {
    const word = w.trim();
    if (!word) continue;
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)) return word.toLowerCase();
  }
  return null;
}

export function decideListing(facts: ListingFacts, settings: ListingSettings, probe: UrlProbe): ListingDecision {
  const reasons: string[] = [];

  let host: string | null = null;
  try {
    host = bareHost(parseSafeUrl(facts.url));
  } catch {
    reasons.push('url_invalid');
  }
  if (host && matchesBlockedDomain(host, settings.blockedDomains)) reasons.push('blocked_domain');

  const word = findBannedWord(`${facts.name}\n${facts.description ?? ''}`, settings.bannedWords);
  if (word) reasons.push(`banned_word:${word}`);

  if (host && !probe.ok) reasons.push('url_unreachable');
  if (facts.categoryRequiresReview) reasons.push('category_requires_review');

  return { outcome: reasons.length === 0 ? 'approve' : 'hold', reasons };
}
