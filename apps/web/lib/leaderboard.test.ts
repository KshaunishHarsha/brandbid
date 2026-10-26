import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { getClaimPrice, getPriceLadder } from './leaderboard';

beforeEach(() => rpc.mockReset());

describe('claim-price helpers', () => {
  it('maps the new-brand price ladder to checkout choices', async () => {
    rpc.mockResolvedValue({
      data: [
        { target_rank: 1, price_cents: 1000 },
        { target_rank: 2, price_cents: 2450 },
      ],
      error: null,
    });

    await expect(getPriceLadder(null)).resolves.toEqual([
      { rank: 1, priceCents: 1000 },
      { rank: 2, priceCents: 2450 },
    ]);
    expect(rpc).toHaveBeenCalledWith('claim_price_ladder', { p_brand_id: undefined });
  });

  it('returns an empty ladder when the board has no quoted rows', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(getPriceLadder('brand-1')).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('claim_price_ladder', { p_brand_id: 'brand-1' });
  });

  it('surfaces ladder query failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'database down' } });

    await expect(getPriceLadder(null)).rejects.toThrow('claim_price_ladder failed: database down');
  });

  it('maps a rank-specific quote and preserves null when the rank is unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: '2450', error: null }).mockResolvedValueOnce({ data: null, error: null });

    await expect(getClaimPrice(null, 2)).resolves.toBe(2450);
    await expect(getClaimPrice('brand-1', 1)).resolves.toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_price', { p_brand_id: null, p_rank: 2 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'claim_price', { p_brand_id: 'brand-1', p_rank: 1 });
  });
});
