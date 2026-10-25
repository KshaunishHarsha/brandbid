import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
const getUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getUser: () => getUser() }));
const userClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => userClient() }));
const adminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient() }));

import { getDashboardData, getMemberBrand, listMyBrands, type MemberBrand } from './dashboard';

const BRAND = {
  id: 'b1', slug: 'acme', name: 'Acme', description: 'Rockets', url: 'https://acme.com/', logo_path: null, status: 'active',
  review_reason: null, rate_cents: '10', total_paid_cents: '5000', budget_cents: '2500', ads_enabled: true, categories: { name: 'SaaS' },
};

/** A user-session client stub: brands lookup + brand_members lookup. */
function sessionClient(opts: { brand?: unknown; membership?: unknown; bids?: unknown[] }) {
  const calls: string[] = [];
  const table = (name: string) => {
    calls.push(name);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: name === 'brands' ? (opts.brand ?? null) : (opts.membership ?? null) });
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: name === 'bids' ? (opts.bids ?? []) : [] });
    return chain;
  };
  const c = { from: vi.fn(table), calls };
  userClient.mockResolvedValue(c);
  return c;
}

beforeEach(() => {
  getUser.mockReset();
  userClient.mockReset();
  adminClient.mockReset();
});

describe('getMemberBrand (who may see a brand dashboard)', () => {
  it('is null for a signed-out visitor without touching the database', async () => {
    getUser.mockResolvedValue(null);
    expect(await getMemberBrand('acme')).toBeNull();
    expect(userClient).not.toHaveBeenCalled();
  });
  it.each(['', 'a b', '../x', 'x'.repeat(61), "a';drop"])('is null for the impossible slug %j, with no query', async (slug) => {
    getUser.mockResolvedValue({ id: 'u1' });
    expect(await getMemberBrand(slug)).toBeNull();
    expect(userClient).not.toHaveBeenCalled();
  });
  it('is null for a brand that does not exist', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    sessionClient({ brand: null });
    expect(await getMemberBrand('acme')).toBeNull();
  });
  it('is null for a signed-in user who is NOT a member, even though the brand is publicly visible', async () => {
    getUser.mockResolvedValue({ id: 'stranger', email: 's@b.c' });
    sessionClient({ brand: BRAND, membership: null });
    expect(await getMemberBrand('acme')).toBeNull();
  });
  it('returns the brand for a member, using the user\'s own session (never the service role)', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'owner@b.c' });
    const c = sessionClient({ brand: BRAND, membership: { role: 'owner' } });
    const m = await getMemberBrand('acme');
    expect(m).toMatchObject({ user: { id: 'u1', email: 'owner@b.c' }, brand: { id: 'b1', slug: 'acme', rateCents: 10, totalPaidCents: 5000, budgetCents: 2500, categoryName: 'SaaS', role: 'owner' } });
    expect(c.calls).toEqual(['brands', 'brand_members']);
    expect(adminClient).not.toHaveBeenCalled();
  });
});

describe('listMyBrands', () => {
  it('is empty when signed out', async () => {
    getUser.mockResolvedValue(null);
    expect(await listMyBrands()).toEqual([]);
  });
  it('lists the user\'s brands newest first', async () => {
    getUser.mockResolvedValue({ id: 'u1' });
    const rows = [
      { role: 'owner', brands: { slug: 'old', name: 'Old', logo_path: null, status: 'active', total_paid_cents: '100', created_at: '2026-01-01T00:00:00Z' } },
      { role: 'owner', brands: { slug: 'new', name: 'New', logo_path: 'x.png', status: 'pending_review', total_paid_cents: '900', created_at: '2026-06-01T00:00:00Z' } },
    ];
    userClient.mockResolvedValue({ from: () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'neq']) c[m] = () => c; c.then = (r: (v: unknown) => void) => r({ data: rows }); return c; } });
    const out = await listMyBrands();
    expect(out.map((b) => b.slug)).toEqual(['new', 'old']);
    expect(out[0]).toEqual({ slug: 'new', name: 'New', logoPath: 'x.png', status: 'pending_review', totalPaidCents: 900, role: 'owner' });
  });
});

describe('getDashboardData', () => {
  const member = (status = 'active', rate = 10): MemberBrand => ({
    user: { id: 'u1', email: 'o@b.c' },
    brand: { id: 'b1', slug: 'acme', name: 'Acme', description: 'x', url: 'https://acme.com/', logoPath: null, status, reviewReason: null, rateCents: rate, totalPaidCents: 5000, budgetCents: 2500, adsEnabled: true, categoryName: 'SaaS', role: 'owner' },
  });
  function admin(over: { rank?: number | null; claim?: number | null; summary?: Record<string, unknown> | null } = {}) {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'brand_ranks') return { data: [{ all_time_rank: over.rank === undefined ? '3' : over.rank, today_rank: '1', today_cents: '700' }] };
      if (fn === 'brand_budget_summary') return { data: over.summary === null ? [] : [{ remaining_cents: '2500', added_cents: '3000', spent_cents: '400', refunded_cents: '100', waitlisted_cents: '30', waitlisted_count: '3', ...over.summary }] };
      if (fn === 'claim_price') return { data: over.claim === undefined ? 5100 : over.claim };
      if (fn === 'claim_price_ladder') return { data: [{ target_rank: 1, price_cents: 9100 }, { target_rank: 2, price_cents: 5100 }] };
      return { data: null };
    });
    const c = { rpc, from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = async () => ({ data: [{ key: 'min_bid_cents', value: 1000 }, { key: 'floor_cents', value: 10 }] });
      chain.single = async () => ({ data: { value: 1000 } });
      return chain;
    } };
    adminClient.mockReturnValue(c);
    return c;
  }
  const bidsClient = (rows: unknown[]) => userClient.mockResolvedValue({ from: (table: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: table === 'budget_refunds' ? null : null });
    c.then = (resolve: (v: unknown) => void) => resolve({ data: table === 'bids' ? rows : [] });
    return c;
  } });

  it('maps ranks, budget, price to move up, ladder, and bids', async () => {
    const a = admin();
    bidsClient([{ id: 'x', amount_cents: '2000', budget_cents: '1000', revenue_cents: '1000', processor_payment_id: 'pay_1', status: 'succeeded', created_at: '2026-10-01T00:00:00Z' }]);
    const d = await getDashboardData(member());
    expect(d).toMatchObject({ allTimeRank: 3, todayRank: 1, todayCents: 700, moveUpPriceCents: 5100, minBidCents: 1000 });
    expect(d.budget).toEqual({ remaining: 2500, added: 3000, spent: 400, refunded: 100, owed: 30, owedCount: 3, visitorsLeft: 250 });
    expect(d.ladder).toEqual([{ rank: 1, priceCents: 9100 }, { rank: 2, priceCents: 5100 }]);
    expect(d.bids).toEqual([{ id: 'x', amountCents: 2000, budgetCents: 1000, revenueCents: 1000, paymentId: 'pay_1', status: 'succeeded', createdAt: '2026-10-01T00:00:00Z' }]);
    expect(a.rpc).toHaveBeenCalledWith('claim_price', { p_brand_id: 'b1', p_rank: 2 }); // the price to take the rank ABOVE
  });
  it('asks for no price to move up when already #1, and tolerates a missing summary', async () => {
    const a = admin({ rank: 1, summary: null });
    bidsClient([]);
    const d = await getDashboardData(member());
    expect(d.moveUpPriceCents).toBeNull();
    expect(a.rpc).not.toHaveBeenCalledWith('claim_price', expect.anything());
    expect(d.budget.remaining).toBe(2500); // falls back to the brand's own cached budget
  });
  it('quotes nothing for a brand that is not live yet', async () => {
    const a = admin();
    bidsClient([]);
    const d = await getDashboardData(member('pending_review'));
    expect(d.moveUpPriceCents).toBeNull();
    expect(d.ladder).toEqual([]);
    expect(a.rpc).not.toHaveBeenCalledWith('claim_price', expect.anything());
    expect(a.rpc).not.toHaveBeenCalledWith('claim_price_ladder', expect.anything());
  });
  it('reads the bid history through the member\'s own session (row-level security), not the service role', async () => {
    const a = admin();
    bidsClient([]);
    await getDashboardData(member());
    expect(userClient).toHaveBeenCalled();
    expect(a.rpc).not.toHaveBeenCalledWith('bids', expect.anything());
  });
});
