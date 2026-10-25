import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { getDiscoverBrands } from './discover-brands';

beforeEach(() => rpc.mockReset());

describe('brand discovery', () => {
  it('loads prioritized campaigns and maps safe public fields', async () => {
    rpc.mockResolvedValue({ data: [{ brand_id: 'b1', slug: 'acme', name: 'Acme', description: null, logo_path: null, url: 'https://acme.test', rate_cents: 20, remaining_budget_cents: 400, visitors_left: 20 }], error: null });
    await expect(getDiscoverBrands()).resolves.toEqual([{ id: 'b1', slug: 'acme', name: 'Acme', description: null, logoPath: null, url: 'https://acme.test', rateCents: 20, remainingBudgetCents: 400, visitorsLeft: 20 }]);
    expect(rpc).toHaveBeenCalledWith('discover_brands', { p_limit: 50, p_offset: 0 });
  });
});
