import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { getPromoterDashboard } from './promoter-dashboard';

beforeEach(() => vi.clearAllMocks());

describe('getPromoterDashboard', () => {
  it('maps service-role aggregates into typed balances and link rows', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        totals: { pending_cents: 60, waitlisted_cents: 15 },
        links: [{
          link_id: 'link-1', link_code: 'Abc12345', link_status: 'active', channel: 'story', link_created_at: '2026-10-01T00:00:00Z',
          brand_id: 'brand-1', brand_name: 'Brand', brand_slug: 'brand', brand_status: 'active', ads_enabled: false,
          brand_budget_cents: 100, brand_rate_cents: 25, clicks: 2, qualified_visitors: 1, pending_cents: 25, pending_count: 1,
          next_settlement_at: '2026-10-26T00:00:00Z', waitlisted_cents: 15,
          waitlisted_earnings: [{ amount_cents: 15, created_at: '2026-10-25T00:00:00Z', expires_at: '2026-11-24T00:00:00Z' }],
          current_cycle_ends_at: '2026-10-26T00:00:00Z',
        }],
      },
    });
    await expect(getPromoterDashboard('promoter-1')).resolves.toMatchObject({
      totals: { pendingCents: 60, waitlistedCents: 15 },
      links: [{ brandSlug: 'brand', clicks: 2, qualifiedVisitors: 1, waitlistedEarnings: [{ amountCents: 15 }] }],
    });
    expect(rpc).toHaveBeenCalledWith('promoter_dashboard', { p_promoter_id: 'promoter-1' });
  });

  it('surfaces database errors instead of showing incorrect zero balances', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'database offline' } });
    await expect(getPromoterDashboard('promoter-1')).rejects.toThrow('database offline');
  });
});
