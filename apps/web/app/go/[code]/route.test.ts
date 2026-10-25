import { beforeEach, describe, expect, it, vi } from 'vitest';

const { background, waitUntil, rpc, sentry } = vi.hoisted(() => {
  const background: Promise<unknown>[] = [];
  const waitUntil = vi.fn((task: Promise<unknown>) => { background.push(task); });
  const rpc = vi.fn();
  const sentry = vi.fn();
  return { background, waitUntil, rpc, sentry };
});

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ ctx: { waitUntil } }) }));
vi.mock('@sentry/nextjs', () => ({ captureException: sentry }));
vi.mock('@/lib/auth-cookie', () => ({ viewerIdFromAuthCookie: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/request', () => ({ getClientIp: () => '203.0.113.7', hashValue: async (value: string) => `hash:${value}` }));
vi.mock('@/lib/ratelimit', () => ({ getLimiter: () => ({ limit: vi.fn().mockResolvedValue({ success: true }) }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (_column: string, value: string) => { if (table === 'links' && value === 'Unknown1') query.unknown = true; return query; };
      query.maybeSingle = async () => table === 'links'
        ? { data: query.unknown ? null : { id: 'link-id', brand_id: 'brand-id', promoter_id: 'promoter-id', status: 'active' }, error: null }
        : table === 'brands'
          ? { data: { slug: 'acme', name: 'Acme & Co', description: 'Useful <things>', status: 'active' }, error: null }
          : { data: { status: 'active' }, error: null };
      return query;
    },
    rpc,
  }),
}));

import { GET } from './route';

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const req = (code: string, headers: Record<string, string> = {}) => new Request(`https://brandbid.wtf/go/${code}`, { headers });

beforeEach(() => {
  background.length = 0;
  waitUntil.mockClear();
  rpc.mockReset().mockResolvedValue({ error: null });
  sentry.mockClear();
});

describe('GET /go/[code]', () => {
  it('sends malformed and unknown links to the home page', async () => {
    const malformed = await GET(req('bad'), ctx('bad'));
    expect(malformed.status).toBe(302);
    expect(new URL(malformed.headers.get('location')!).pathname).toBe('/');

    const unknown = await GET(req('Unknown1'), ctx('Unknown1'));
    expect(unknown.status).toBe(302);
    expect(new URL(unknown.headers.get('location')!).pathname).toBe('/');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('serves escaped preview metadata to crawlers without recording a click', async () => {
    const response = await GET(req('Botcode1', { 'user-agent': 'facebookexternalhit/1.1' }), ctx('Botcode1'));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('og:image');
    expect(html).toContain('Acme &amp; Co on brandbid');
    expect(html).toContain('Useful &lt;things&gt;');
    expect(rpc).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('returns 204 for link prefetches without setting a cookie or recording a click', async () => {
    const response = await GET(req('Prefetc1', { purpose: 'prefetch', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }), ctx('Prefetc1'));
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('redirects humans immediately and records a click in the background without EU cookies', async () => {
    const response = await GET(req('Human001', { 'user-agent': 'Mozilla/5.0 Chrome/120.0', 'cf-ipcountry': 'DE', 'cf-connecting-ip': '203.0.113.7' }), ctx('Human001'));
    const location = new URL(response.headers.get('location')!);
    expect(response.status).toBe(302);
    expect(location.pathname).toBe('/b/acme');
    expect(location.searchParams.get('l')).toBe('Human001');
    expect(location.searchParams.get('c')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(waitUntil).toHaveBeenCalledOnce();
    await Promise.all(background);
    expect(rpc).toHaveBeenCalledWith('record_click', expect.objectContaining({
      p_click_id: location.searchParams.get('c'), p_link_id: 'link-id', p_brand_id: 'brand-id',
      p_promoter_id: 'promoter-id', p_country: 'DE', p_cookie_id: undefined,
      p_ip_hash: 'hash:203.0.113.7', p_ua_hash: expect.stringContaining('hash:'),
    }));
  });

  it('sets a secure visitor cookie outside consent countries', async () => {
    const response = await GET(req('Human002', { 'user-agent': 'Mozilla/5.0 Chrome/120.0', 'cf-ipcountry': 'US' }), ctx('Human002'));
    expect(response.headers.get('set-cookie')).toMatch(/^bb_vid=[0-9a-f]{32}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
    await Promise.all(background);
    expect(rpc).toHaveBeenCalledWith('record_click', expect.objectContaining({ p_cookie_id: expect.stringMatching(/^[0-9a-f]{32}$/i) }));
  });
});
