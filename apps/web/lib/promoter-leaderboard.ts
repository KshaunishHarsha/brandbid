import { createAdminClient } from '@/lib/supabase/admin';

export type PromoterBoardPeriod = 'week' | 'all_time';
export type PromoterBoardRow = { rank: number; handle: string; earnedCents: number; qualifiedVisitors: number };

export async function getPromoterLeaderboard(period: PromoterBoardPeriod, limit = 50): Promise<PromoterBoardRow[]> {
  const { data, error } = await createAdminClient().rpc('promoter_leaderboard', { p_period: period, p_limit: limit, p_offset: 0 });
  if (error) throw new Error(`promoter_leaderboard failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    rank: Number(row.board_rank),
    handle: row.handle,
    earnedCents: Number(row.earned_cents),
    qualifiedVisitors: Number(row.qualified_visitors),
  }));
}
