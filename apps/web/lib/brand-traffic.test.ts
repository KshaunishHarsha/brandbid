import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));

import { getBrandTrafficStats } from './brand-traffic';

beforeEach(() => vi.clearAllMocks());

describe('getBrandTrafficStats', () => {
  it('maps daily and breakdown aggregates returned by the member-scoped function', async () => {
    rpc.mockResolvedValue({ error: null, data: {
      daily: [{ day: '2026-10-25', clicks: 4, qualified_visitors: 2, click_throughs: 1 }],
      channels: [{ channel: 'story', clicks: 3, qualified_visitors: 2, click_throughs: 1 }],
      countries: [{ country: 'IN', clicks: 4, qualified_visitors: 2, click_throughs: 1 }],
    } });
    await expect(getBrandTrafficStats('brand-1')).resolves.toEqual({
      daily: [{ day: '2026-10-25', clicks: 4, qualifiedVisitors: 2, clickThroughs: 1 }],
      channels: [{ channel: 'story', clicks: 3, qualifiedVisitors: 2, clickThroughs: 1 }],
      countries: [{ country: 'IN', clicks: 4, qualifiedVisitors: 2, clickThroughs: 1 }],
    });
    expect(rpc).toHaveBeenCalledWith('brand_traffic_stats', { p_brand_id: 'brand-1' });
  });

  it('surfaces authorization and database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'brand_membership_required' } });
    await expect(getBrandTrafficStats('brand-1')).rejects.toThrow('brand_membership_required');
  });
});
