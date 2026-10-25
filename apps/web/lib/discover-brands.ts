import { createAdminClient } from '@/lib/supabase/admin';

export type DiscoverBrand = { id: string; slug: string; name: string; description: string | null; logoPath: string | null; url: string; rateCents: number; remainingBudgetCents: number; visitorsLeft: number };

export async function getDiscoverBrands(limit = 50): Promise<DiscoverBrand[]> {
  const { data, error } = await createAdminClient().rpc('discover_brands', { p_limit: limit, p_offset: 0 });
  if (error) throw new Error(`discover_brands failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.brand_id, slug: row.slug, name: row.name, description: row.description,
    logoPath: row.logo_path, url: row.url, rateCents: Number(row.rate_cents),
    remainingBudgetCents: Number(row.remaining_budget_cents), visitorsLeft: Number(row.visitors_left),
  }));
}
