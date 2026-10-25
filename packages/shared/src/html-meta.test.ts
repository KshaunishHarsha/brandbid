import { describe, expect, it } from 'vitest';
import { decodeEntities, parseMeta } from './html-meta';

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>x</body></html>`;

describe('decodeEntities', () => {
  it('decodes named and numeric entities, leaves unknown ones', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x27;y&#x27; &nbsp;z')).toBe(`Tom & Jerry <3 "hi" 'x' 'y'  z`);
    expect(decodeEntities('&bogus; &#99999999;')).toBe('&bogus; &#99999999;');
  });
});

describe('parseMeta', () => {
  const base = 'https://acme.com/landing';

  it('prefers Open Graph, then falls back', () => {
    const m = parseMeta(
      page(`<title>Acme - Rockets for everyone | Acme Inc</title>
            <meta property="og:site_name" content="Acme">
            <meta property="og:description" content="Rockets, delivered.">
            <meta name="description" content="Fallback desc">
            <meta property="og:image" content="https://cdn.acme.com/og.png">`),
      base,
    );
    expect(m).toEqual({ name: 'Acme', description: 'Rockets, delivered.', image: 'https://cdn.acme.com/og.png' });
  });

  it('falls back to the <title> (first segment) and meta description', () => {
    const m = parseMeta(page(`<title>Acme — Rockets for everyone</title><meta name="description" content="Plain desc">`), base);
    expect(m.name).toBe('Acme');
    expect(m.description).toBe('Plain desc');
    expect(m.image).toBeNull();
  });

  it('handles attribute order, quotes, case and entities', () => {
    const m = parseMeta(
      page(`<META CONTENT='Tom &amp; Jerry' PROPERTY=og:site_name><meta content="A &quot;quoted&quot; thing" name="description">`),
      base,
    );
    expect(m.name).toBe('Tom & Jerry');
    expect(m.description).toBe('A "quoted" thing');
  });

  it('resolves relative image URLs and rejects non-https ones', () => {
    expect(parseMeta(page(`<meta property="og:image" content="/img/og.png">`), base).image).toBe('https://acme.com/img/og.png');
    expect(parseMeta(page(`<meta property="og:image" content="//cdn.acme.com/a.png">`), base).image).toBe('https://cdn.acme.com/a.png');
    expect(parseMeta(page(`<meta property="og:image" content="http://acme.com/a.png">`), base).image).toBeNull();
    expect(parseMeta(page(`<meta property="og:image" content="data:image/png;base64,AAAA">`), base).image).toBeNull();
    expect(parseMeta(page(`<meta property="og:image" content="javascript:x">`), base).image).toBeNull();
  });

  it('truncates long values at a word boundary', () => {
    const long = 'word '.repeat(100);
    const m = parseMeta(page(`<meta name="description" content="${long}"><meta property="og:site_name" content="${long}">`), base);
    expect(m.description.length).toBeLessThanOrEqual(160);
    expect(m.name.length).toBeLessThanOrEqual(60);
    expect(m.description.endsWith('…')).toBe(true);
  });

  it('returns empty strings for pages with no metadata, and never throws on junk', () => {
    expect(parseMeta('', base)).toEqual({ name: '', description: '', image: null });
    expect(parseMeta('<<<<>>>> <meta', base)).toEqual({ name: '', description: '', image: null });
    expect(parseMeta('\u0000￿', base).image).toBeNull();
  });

  it('ignores meta tags far past the head (cap) and uses the first of duplicates', () => {
    const m = parseMeta(page(`<meta name="description" content="first"><meta name="description" content="second">`), base);
    expect(m.description).toBe('first');
    expect(parseMeta('x'.repeat(250_000) + '<meta name="description" content="late">', base).description).toBe('');
  });
});
