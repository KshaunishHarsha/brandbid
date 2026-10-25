import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }));
const getBoard = vi.fn();
vi.mock('@/lib/leaderboard', () => ({ getBoard: (...a: unknown[]) => getBoard(...a) }));

import { getBrandPage, getBrandUrlBySlug, SLUG_PATTERN } from './brand';

/** A stub of the bits of the Supabase client these functions use. Records the filters applied. */
function stubDb(opts: { brand?: unknown; ranks?: unknown; error?: string }) {
  const filters: Array<[string, unknown]> = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => (filters.push([col, val]), chain)),
    maybeSingle: vi.fn(async () => ({ data: opts.brand ?? null, error: opts.error ? { message: opts.error } : null })),
  };
  const db = { from: vi.fn(() => chain), rpc: vi.fn(async () => ({ data: opts.ranks ?? [], error: null })) };
  createAdminClient.mockReturnValue(db);
  return { db, filters };
}

const brandRow = {
  id: 'b1', slug: 'acme', name: 'Acme', description: 'Rockets', url: 'https://acme.com/', logo_path: 'b1.png',
  total_paid_cents: '5000', created_at: '2026-10-01T00:00:00Z', category_id: 3, categories: { id: 3, slug: 'saas', name: 'SaaS' },
};
const boardRow = (id: string) => ({ rank: 1, brandId: id, slug: id, name: id, description: null, logoPath: null, url: 'https://x.com', categoryId: 3, totalPaidCents: 100, takePriceCents: 1000, todayCents: null });

beforeEach(() => {
  createAdminClient.mockReset();
  getBoard.mockReset();
  getBoard.mockResolvedValue([]);
});

describe('SLUG_PATTERN', () => {
  it.each(['acme', 'acme-2', 'a', 'Acme', 'a1-b2-c3'])('accepts %s', (s) => expect(SLUG_PATTERN.test(s)).toBe(true));
  it.each(['', 'a b', 'a/b', '-a', 'a-', 'a--b', 'a_b', '../x', 'a%20b', "a'b", 'é'])('rejects %j', (s) => expect(SLUG_PATTERN.test(s)).toBe(false));
});

describe('getBrandPage', () => {
  it('never touches the database for a slug that cannot exist', async () => {
    for (const s of ['', 'a b', '../etc', 'x'.repeat(61), "a';drop"]) expect(await getBrandPage(s)).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('asks only for LIVE brands', async () => {
    const { filters } = stubDb({ brand: null });
    expect(await getBrandPage('acme')).toBeNull();
    expect(filters).toContainEqual(['status', 'active']);
    expect(filters).toContainEqual(['slug', 'acme']);
  });

  it('maps the brand, its ranks, and related brands (without itself, max 5)', async () => {
    stubDb({ brand: brandRow, ranks: [{ all_time_rank: '2', today_rank: null, today_cents: '0' }] });
    getBoard.mockResolvedValue(['b1', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map(boardRow));
    const p = (await getBrandPage('acme'))!;
    expect(p).toMatchObject({
      id: 'b1', slug: 'acme', name: 'Acme', url: 'https://acme.com/', totalPaidCents: 5000,
      category: { slug: 'saas', name: 'SaaS' }, allTimeRank: 2, todayRank: null, todayCents: 0,
    });
    expect(p.related.map((r) => r.brandId)).toEqual(['o1', 'o2', 'o3', 'o4', 'o5']);
    expect(getBoard).toHaveBeenCalledWith('all', 3, 7);
  });

  it('copes with a brand that has no rank data yet or no category', async () => {
    stubDb({ brand: { ...brandRow, category_id: null, categories: null }, ranks: [] });
    const p = (await getBrandPage('acme'))!;
    expect(p.allTimeRank).toBeNull();
    expect(p.todayRank).toBeNull();
    expect(p.category).toBeNull();
    expect(getBoard).toHaveBeenCalledWith('all', null, 7);
  });

  it('surfaces database errors instead of pretending the brand does not exist', async () => {
    stubDb({ error: 'connection refused' });
    await expect(getBrandPage('acme')).rejects.toThrow(/connection refused/);
  });
});

describe('getBrandUrlBySlug', () => {
  it('returns the url of a live brand only', async () => {
    const { filters } = stubDb({ brand: { url: 'https://acme.com/' } });
    expect(await getBrandUrlBySlug('acme')).toBe('https://acme.com/');
    expect(filters).toContainEqual(['status', 'active']);
  });
  it('returns null for unknown brands and impossible slugs without a query', async () => {
    stubDb({ brand: null });
    expect(await getBrandUrlBySlug('nope')).toBeNull();
    createAdminClient.mockClear();
    expect(await getBrandUrlBySlug('bad slug!')).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
