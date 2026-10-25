import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBrandUrlBySlug = vi.fn();
vi.mock('@/lib/brand', () => ({ getBrandUrlBySlug: (...a: unknown[]) => getBrandUrlBySlug(...a) }));

import { GET } from './route';

const call = async (slug: string) => GET(new Request(`http://localhost:3000/out/b/${slug}`), { params: Promise.resolve({ slug }) });

beforeEach(() => getBrandUrlBySlug.mockReset());

describe('GET /out/b/[slug]', () => {
  it('redirects (302) to the brand with listing UTM tags', async () => {
    getBrandUrlBySlug.mockResolvedValue('https://acme.com/');
    const res = await call('acme');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://acme.com/?utm_source=brandbid&utm_medium=listing');
  });

  it('keeps the brand URL path and existing query parameters', async () => {
    getBrandUrlBySlug.mockResolvedValue('https://acme.com/pricing?plan=pro&ref=friend');
    const loc = new URL((await call('acme')).headers.get('location')!);
    expect(loc.pathname).toBe('/pricing');
    expect(loc.searchParams.get('plan')).toBe('pro');
    expect(loc.searchParams.get('ref')).toBe('friend');
    expect(loc.searchParams.get('utm_source')).toBe('brandbid');
    expect(loc.searchParams.get('utm_medium')).toBe('listing');
  });

  it('drops a #fragment: brand URLs are stored through the same validator, which never keeps one', async () => {
    getBrandUrlBySlug.mockResolvedValue('https://acme.com/pricing#top');
    expect(new URL((await call('acme')).headers.get('location')!).hash).toBe('');
  });

  it('is a 404 for a brand that is not live or does not exist', async () => {
    getBrandUrlBySlug.mockResolvedValue(null);
    const res = await call('nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it.each([
    ['http downgrade', 'http://acme.com/'],
    ['loopback', 'https://127.0.0.1/admin'],
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['file scheme', 'file:///etc/passwd'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['credentials', 'https://user:pw@acme.com/'],
    ['garbage', 'not a url'],
  ])('never redirects to an unsafe stored URL (%s)', async (_name, stored) => {
    getBrandUrlBySlug.mockResolvedValue(stored);
    const res = await call('acme');
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes the slug through unchanged', async () => {
    getBrandUrlBySlug.mockResolvedValue(null);
    await call('Some-Brand');
    expect(getBrandUrlBySlug).toHaveBeenCalledWith('Some-Brand');
  });
});
