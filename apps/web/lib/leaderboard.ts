import { createAdminClient } from '@/lib/supabase/admin';

// Read side of the public boards. Calls the SQL functions with the service role: the data is public, and the
// bids table is never exposed to client roles. All ranking rules live in SQL (migration 000800).

export type BoardKind = 'all' | 'today';

export type BoardRow = {
  rank: number;
  brandId: string;
  slug: string;
  name: string;
  description: string | null;
  logoPath: string | null;
  url: string;
  categoryId: number | null;
  totalPaidCents: number;
  /** All-time board only: what a new brand pays to take exactly this spot. */
  takePriceCents: number | null;
  /** Today board only: paid since 00:00 UTC. */
  todayCents: number | null;
};

export type CategoryTab = { id: number; slug: string; name: string; liveBrands: number };

export const BOARD_PAGE_SIZE = 50;

export async function getBoard(kind: BoardKind, categoryId: number | null, limit = BOARD_PAGE_SIZE): Promise<BoardRow[]> {
  const db = createAdminClient();
  const args = { p_category_id: categoryId ?? undefined, p_limit: limit, p_offset: 0 };
  if (kind === 'today') {
    const { data, error } = await db.rpc('leaderboard_today', args);
    if (error) throw new Error(`leaderboard_today failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      rank: Number(r.board_rank), brandId: r.brand_id, slug: r.slug, name: r.name, description: r.description,
      logoPath: r.logo_path, url: r.url, categoryId: r.category_id, totalPaidCents: Number(r.total_paid_cents),
      takePriceCents: null, todayCents: Number(r.today_cents),
    }));
  }
  const { data, error } = await db.rpc('leaderboard_all_time', args);
  if (error) throw new Error(`leaderboard_all_time failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    rank: Number(r.board_rank), brandId: r.brand_id, slug: r.slug, name: r.name, description: r.description,
    logoPath: r.logo_path, url: r.url, categoryId: r.category_id, totalPaidCents: Number(r.total_paid_cents),
    takePriceCents: Number(r.take_price_cents), todayCents: null,
  }));
}

export async function getCategoryTabs(): Promise<CategoryTab[]> {
  const { data, error } = await createAdminClient().rpc('category_counts');
  if (error) throw new Error(`category_counts failed: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name, liveBrands: Number(c.live_brands) }));
}

export type LadderStep = { rank: number; priceCents: number };

/** Menu of prices for the checkout. `brandId` null = a brand that isn't listed yet. */
export async function getPriceLadder(brandId: string | null): Promise<LadderStep[]> {
  const { data, error } = await createAdminClient().rpc('claim_price_ladder', { p_brand_id: brandId ?? undefined });
  if (error) throw new Error(`claim_price_ladder failed: ${error.message}`);
  return (data ?? []).map((r) => ({ rank: Number(r.target_rank), priceCents: Number(r.price_cents) }));
}

export async function getClaimPrice(brandId: string | null, rank: number): Promise<number | null> {
  const { data, error } = await createAdminClient().rpc('claim_price', {
    // The generated type can't express "nullable uuid"; SQL treats NULL as "a brand that isn't listed yet".
    p_brand_id: brandId as unknown as string,
    p_rank: rank,
  });
  if (error) throw new Error(`claim_price failed: ${error.message}`);
  return data === null ? null : Number(data);
}
