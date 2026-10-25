import { createAdminClient } from '@/lib/supabase/admin';
import { getBoard, type BoardRow } from '@/lib/leaderboard';

export type BrandPage = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  url: string;
  logoPath: string | null;
  totalPaidCents: number;
  listedAt: string;
  category: { id: number; slug: string; name: string } | null;
  allTimeRank: number | null;
  todayRank: number | null;
  todayCents: number;
  related: BoardRow[];
};

/** Slugs are lowercase letters, digits and dashes (database check). Anything else cannot exist: skip the query. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/i;

/** A live brand's public page data, or null if it does not exist or is not live (draft, in review, rejected, removed). */
export async function getBrandPage(slug: string): Promise<BrandPage | null> {
  if (slug.length > 60 || !SLUG_PATTERN.test(slug)) return null;
  const db = createAdminClient();

  const { data: brand, error } = await db
    .from('brands')
    .select('id, slug, name, description, url, logo_path, total_paid_cents, created_at, category_id, categories(id, slug, name)')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`getBrandPage failed: ${error.message}`);
  if (!brand) return null;

  const [{ data: ranks }, others] = await Promise.all([
    db.rpc('brand_ranks', { p_brand_id: brand.id }),
    // A few more from the same category so brandbid keeps some of the traffic; the whole board if it has no category.
    getBoard('all', brand.category_id, 7),
  ]);
  const r = ranks?.[0];

  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    description: brand.description,
    url: brand.url,
    logoPath: brand.logo_path,
    totalPaidCents: Number(brand.total_paid_cents),
    listedAt: brand.created_at,
    category: brand.categories ?? null,
    allTimeRank: r?.all_time_rank == null ? null : Number(r.all_time_rank),
    todayRank: r?.today_rank == null ? null : Number(r.today_rank),
    todayCents: Number(r?.today_cents ?? 0),
    related: others.filter((o) => o.brandId !== brand.id).slice(0, 5),
  };
}

/** Where the Visit button sends people: the brand's own URL, re-validated and tagged for their analytics. */
export async function getBrandUrlBySlug(slug: string): Promise<string | null> {
  if (slug.length > 60 || !SLUG_PATTERN.test(slug)) return null;
  const { data, error } = await createAdminClient()
    .from('brands')
    .select('url')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`getBrandUrlBySlug failed: ${error.message}`);
  return data?.url ?? null;
}
