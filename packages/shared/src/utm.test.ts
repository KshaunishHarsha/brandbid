import { describe, expect, it } from 'vitest';
import { addUtm, listingUtm } from './utm';

describe('addUtm', () => {
  it('adds the tags to a plain URL', () => {
    expect(addUtm('https://acme.com', { source: 'brandbid', medium: 'promoter', campaign: 'alice', content: 'x' })).toBe(
      'https://acme.com/?utm_source=brandbid&utm_medium=promoter&utm_campaign=alice&utm_content=x',
    );
  });
  it('keeps the path, existing query parameters, their order, and the fragment', () => {
    const out = new URL(addUtm('https://acme.com/pricing?plan=pro&ref=friend#top', { source: 'brandbid', medium: 'listing' }));
    expect(out.pathname).toBe('/pricing');
    expect(out.searchParams.get('plan')).toBe('pro');
    expect(out.searchParams.get('ref')).toBe('friend');
    expect([...out.searchParams.keys()]).toEqual(['plan', 'ref', 'utm_source', 'utm_medium']);
    expect(out.hash).toBe('#top');
  });
  it("replaces the brand's own utm_* values instead of duplicating them", () => {
    const out = new URL(addUtm('https://acme.com/?utm_source=newsletter&utm_medium=email&utm_campaign=old', { source: 'brandbid', medium: 'listing' }));
    expect(out.searchParams.getAll('utm_source')).toEqual(['brandbid']);
    expect(out.searchParams.getAll('utm_medium')).toEqual(['listing']);
    expect(out.searchParams.get('utm_campaign')).toBe('old'); // not ours to change when we don't set one
  });
  it('omits campaign and content when not given', () => {
    const out = new URL(addUtm('https://acme.com', { source: 'brandbid', medium: 'listing' }));
    expect(out.searchParams.has('utm_campaign')).toBe(false);
    expect(out.searchParams.has('utm_content')).toBe(false);
  });
  it('encodes unusual values safely', () => {
    const out = new URL(addUtm('https://acme.com', { source: 'brandbid', medium: 'promoter', campaign: 'a&b=c d' }));
    expect(out.searchParams.get('utm_campaign')).toBe('a&b=c d');
    expect(out.searchParams.get('b')).toBeNull(); // the "&b=c" did not become a separate parameter
  });
  it('throws on a URL it cannot parse', () => {
    expect(() => addUtm('not a url', { source: 'a', medium: 'b' })).toThrow();
  });
});

describe('listingUtm', () => {
  it('tags organic listing traffic', () => {
    expect(listingUtm('https://acme.com/x?y=1')).toBe('https://acme.com/x?y=1&utm_source=brandbid&utm_medium=listing');
  });
});
