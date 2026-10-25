import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { getPromoterLeaderboard } from './promoter-leaderboard';

beforeEach(() => rpc.mockReset());

describe('promoter leaderboard', () => {
  it('requests only the selected public period and maps settled totals', async () => {
    rpc.mockResolvedValue({ data: [{ board_rank: 1, handle: 'anonymous', earned_cents: 1234, qualified_visitors: 5 }], error: null });
    await expect(getPromoterLeaderboard('week', 25)).resolves.toEqual([{ rank: 1, handle: 'anonymous', earnedCents: 1234, qualifiedVisitors: 5 }]);
    expect(rpc).toHaveBeenCalledWith('promoter_leaderboard', { p_period: 'week', p_limit: 25, p_offset: 0 });
  });

  it('surfaces database errors instead of rendering stale or partial data', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'database down' } });
    await expect(getPromoterLeaderboard('all_time')).rejects.toThrow('promoter_leaderboard failed: database down');
  });
});
