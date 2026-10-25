import { describe, expect, it } from 'vitest';
import { decideListing, findBannedWord, matchesBlockedDomain, type ListingFacts } from './listing-check';

const facts = (over: Partial<ListingFacts> = {}): ListingFacts => ({
  name: 'Acme',
  description: 'Rockets for everyone',
  url: 'https://acme.com/',
  categoryRequiresReview: false,
  ...over,
});
const clean = { blockedDomains: [] as string[], bannedWords: [] as string[] };
const up = { ok: true };

describe('decideListing', () => {
  it('approves a clean, reachable, non-review listing', () => {
    expect(decideListing(facts(), clean, up)).toEqual({ outcome: 'approve', reasons: [] });
  });
  it('holds review categories (crypto, finance, health, gambling-adjacent)', () => {
    expect(decideListing(facts({ categoryRequiresReview: true }), clean, up)).toEqual({ outcome: 'hold', reasons: ['category_requires_review'] });
  });
  it('holds blocked domains, including subdomains and www', () => {
    const s = { ...clean, blockedDomains: ['scam.com'] };
    expect(decideListing(facts({ url: 'https://scam.com' }), s, up).reasons).toContain('blocked_domain');
    expect(decideListing(facts({ url: 'https://www.scam.com/x' }), s, up).reasons).toContain('blocked_domain');
    expect(decideListing(facts({ url: 'https://shop.scam.com' }), s, up).reasons).toContain('blocked_domain');
    expect(decideListing(facts({ url: 'https://notscam.com' }), s, up).outcome).toBe('approve');
    expect(decideListing(facts({ url: 'https://scam.com.evil.org' }), s, up).outcome).toBe('approve');
  });
  it('holds banned words in name or description, whole words only', () => {
    const s = { ...clean, bannedWords: ['casino', 'Viagra'] };
    expect(decideListing(facts({ name: 'Best Casino' }), s, up).reasons).toEqual(['banned_word:casino']);
    expect(decideListing(facts({ description: 'Buy VIAGRA now' }), s, up).reasons).toEqual(['banned_word:viagra']);
    expect(decideListing(facts({ name: 'Casinos united' }), s, up).outcome).toBe('approve'); // not the whole word
    expect(decideListing(facts({ name: 'Scunthorpe' }), { ...clean, bannedWords: ['thor'] }, up).outcome).toBe('approve');
  });
  it('holds unreachable URLs', () => {
    expect(decideListing(facts(), clean, { ok: false }).reasons).toEqual(['url_unreachable']);
  });
  it('holds unsafe or invalid URLs and does not bother probing', () => {
    expect(decideListing(facts({ url: 'http://acme.com' }), clean, up).reasons).toEqual(['url_invalid']);
    expect(decideListing(facts({ url: 'https://127.0.0.1' }), clean, { ok: false }).reasons).toEqual(['url_invalid']);
  });
  it('reports every problem at once, in a stable order', () => {
    const d = decideListing(
      facts({ name: 'Casino', categoryRequiresReview: true, url: 'https://scam.com' }),
      { blockedDomains: ['scam.com'], bannedWords: ['casino'] },
      { ok: false },
    );
    expect(d.reasons).toEqual(['blocked_domain', 'banned_word:casino', 'url_unreachable', 'category_requires_review']);
    expect(d.outcome).toBe('hold');
  });
  it('handles a missing description', () => {
    expect(decideListing(facts({ description: null }), clean, up).outcome).toBe('approve');
  });
});

describe('helpers', () => {
  it('matchesBlockedDomain ignores blanks', () => {
    expect(matchesBlockedDomain('acme.com', ['', '  '])).toBe(false);
  });
  it('findBannedWord escapes regex characters and supports unicode', () => {
    expect(findBannedWord('a+b deal', ['a+b'])).toBe('a+b');
    expect(findBannedWord('x', ['.*'])).toBeNull();
    expect(findBannedWord('große Casino', ['casino'])).toBe('casino');
  });
});
