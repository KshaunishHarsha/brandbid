import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  lookupErrors: {} as Record<string, unknown>,
  updates: [] as Array<{ table: string; values: unknown; filters: Array<[string, unknown, unknown?]> }>,
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let updateValues: unknown = null;
      const filters: Array<[string, unknown, unknown?]> = [];
      const query: Record<string, (...args: any[]) => any> = {
        select: () => query,
        update: (values: unknown) => { updateValues = values; mocks.updates.push({ table, values, filters }); return query; },
        eq: (column: string, value: unknown) => { filters.push(['eq', column, value]); return query; },
        is: (column: string, value: unknown) => { filters.push(['is', column, value]); return query; },
        maybeSingle: async () => ({ data: mocks.rows[table] ?? null, error: mocks.lookupErrors[table] ?? null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve, reject),
      };
      return query;
    },
  }),
}));

import { GET } from './route';

const clickId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const click = { id: clickId, brand_id: 'brand-id', link_id: 'link-id', promoter_id: 'promoter-id' };
const call = (id = clickId) => GET(new Request(`https://brandbid.test/out/${id}`), { params: Promise.resolve({ click: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  mocks.rows = {
    clicks: click,
    brands: { url: 'https://acme.com/pricing?plan=pro&utm_medium=old' },
    links: { channel: 'story' },
    public_profiles: { handle: 'promoter_1' },
  };
  mocks.lookupErrors = {};
});

describe('GET /out/[click_id]', () => {
  it('redirects with promoter/channel UTM tags and preserves existing query parameters', async () => {
    const response = await call();
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get('location')!);
    expect(target.origin).toBe('https://acme.com');
    expect(target.pathname).toBe('/pricing');
    expect(target.searchParams.get('plan')).toBe('pro');
    expect(target.searchParams.get('utm_source')).toBe('brandbid');
    expect(target.searchParams.get('utm_medium')).toBe('promoter');
    expect(target.searchParams.get('utm_campaign')).toBe('promoter_1');
    expect(target.searchParams.get('utm_content')).toBe('story');
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].values).toEqual(expect.objectContaining({ outbound_at: expect.any(String) }));
  });

  it('sends malformed or unknown click IDs to the home page without a database query', async () => {
    const response = await call('not-a-click');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://brandbid.test/');
    expect(mocks.updates).toHaveLength(0);
  });

  it('does not update or redirect for an inactive brand', async () => {
    mocks.rows.brands = null;
    const response = await call();
    expect(response.headers.get('location')).toBe('https://brandbid.test/');
    expect(mocks.updates).toHaveLength(0);
  });

  it('never redirects to an unsafe stored brand URL', async () => {
    mocks.rows.brands = { url: 'https://127.0.0.1/admin' };
    const response = await call();
    expect(response.headers.get('location')).toBe('https://brandbid.test/');
    expect(mocks.updates).toHaveLength(0);
  });
});
