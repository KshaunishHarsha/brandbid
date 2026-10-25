import { createAdminClient } from '@/lib/supabase/admin';

export type TopPromoter = { rank: number; handle: string | null; anonymous: boolean; earnedCents: number; qualifiedVisitors: number };

export async function getTopPromotersForBrand(brandId: string, limit = 10): Promise<TopPromoter[]> {
  const { data, error } = await createAdminClient().rpc('top_promoters_for_brand', { p_brand_id: brandId, p_limit: limit });
  if (error) throw new Error(`top_promoters_for_brand failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    rank: Number(row.board_rank), handle: row.handle, anonymous: row.is_anonymous,
    earnedCents: Number(row.earned_cents), qualifiedVisitors: Number(row.qualified_visitors),
  }));
}
