import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { getTopPromotersForBrand } from './top-promoters';

beforeEach(() => rpc.mockReset());

describe('top promoters by brand', () => {
  it('preserves explicit anonymity and settled totals', async () => {
    rpc.mockResolvedValue({ data: [{ board_rank: 1, handle: null, is_anonymous: true, earned_cents: 400, qualified_visitors: 4 }], error: null });
    await expect(getTopPromotersForBrand('brand-id')).resolves.toEqual([{ rank: 1, handle: null, anonymous: true, earnedCents: 400, qualifiedVisitors: 4 }]);
    expect(rpc).toHaveBeenCalledWith('top_promoters_for_brand', { p_brand_id: 'brand-id', p_limit: 10 });
  });
});
