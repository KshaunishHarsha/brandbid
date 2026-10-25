import { visitorsAffordable } from '@brandbid/shared';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type MemberBrand = {
  user: { id: string; email: string | null };
  brand: {
    id: string; slug: string; name: string; description: string | null; url: string; logoPath: string | null;
    status: string; reviewReason: string | null; rateCents: number; totalPaidCents: number; budgetCents: number;
    adsEnabled: boolean; categoryName: string | null; role: string;
  };
};

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/i;

/**
 * The signed-in user's view of one brand, or null if they are not a member of it (the page answers 404 either way, so
 * a stranger can't tell "no such brand" from "not yours"). The lookups use the USER's own session, so row-level
 * security does the checking; only after that do we use the service role for numbers members aren't allowed to query.
 */
export async function getMemberBrand(slug: string): Promise<MemberBrand | null> {
  if (slug.length > 60 || !SLUG_RE.test(slug)) return null;
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, slug, name, description, url, logo_path, status, review_reason, rate_cents, total_paid_cents, budget_cents, ads_enabled, categories(name)')
    .eq('slug', slug)
    .maybeSingle();
  if (!brand) return null;

  const { data: membership } = await supabase
    .from('brand_members')
    .select('role')
    .eq('brand_id', brand.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return null;

  return {
    user: { id: user.id, email: user.email ?? null },
    brand: {
      id: brand.id, slug: brand.slug, name: brand.name, description: brand.description, url: brand.url, logoPath: brand.logo_path,
      status: brand.status, reviewReason: brand.review_reason, rateCents: Number(brand.rate_cents),
      totalPaidCents: Number(brand.total_paid_cents), budgetCents: Number(brand.budget_cents), adsEnabled: brand.ads_enabled,
      categoryName: brand.categories?.name ?? null, role: membership.role,
    },
  };
}

export type DashboardBrandRow = { slug: string; name: string; logoPath: string | null; status: string; totalPaidCents: number; role: string };

/** The brands the signed-in user belongs to (never unpaid drafts), newest first. */
export async function listMyBrands(): Promise<DashboardBrandRow[]> {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('brand_members')
    .select('role, brands!inner(slug, name, logo_path, status, total_paid_cents, created_at)')
    .eq('user_id', user.id)
    .neq('brands.status', 'draft');
  return (data ?? [])
    .map((m) => ({
      created: m.brands.created_at,
      row: { slug: m.brands.slug, name: m.brands.name, logoPath: m.brands.logo_path, status: m.brands.status, totalPaidCents: Number(m.brands.total_paid_cents), role: m.role },
    }))
    .sort((a, b) => b.created.localeCompare(a.created))
    .map((x) => x.row);
}

export type BidRow = { id: string; amountCents: number; budgetCents: number; revenueCents: number; paymentId: string; status: string; createdAt: string };
export type DashboardData = {
  allTimeRank: number | null; todayRank: number | null; todayCents: number;
  moveUpPriceCents: number | null; ladder: Array<{ rank: number; priceCents: number }>; minBidCents: number; floorCents: number;
  budget: { remaining: number; added: number; spent: number; refunded: number; owed: number; owedCount: number; visitorsLeft: number };
  bids: BidRow[];
  refundEligibility: { eligible: boolean; reason: string | null; amountCents: number } | null;
  refund: { status: string; amountCents: number } | null;
};

/** Numbers for the dashboard. Call only after getMemberBrand() succeeded. */
export async function getDashboardData(member: MemberBrand): Promise<DashboardData> {
  const db = createAdminClient();
  const supabase = await createClient();
  const id = member.brand.id;

  const [ranks, summary, settings, bids, refundEligibility, refund] = await Promise.all([
    db.rpc('brand_ranks', { p_brand_id: id }),
    db.rpc('brand_budget_summary', { p_brand_id: id }),
    db.from('settings').select('key,value').in('key', ['min_bid_cents', 'floor_cents']),
    supabase.from('bids').select('id, amount_cents, budget_cents, revenue_cents, processor_payment_id, status, created_at').eq('brand_id', id).order('created_at', { ascending: false }).limit(50),
    member.brand.role === 'owner'
      ? db.rpc('budget_refund_eligibility', { p_brand_id: id, p_requester: member.user.id })
      : Promise.resolve({ data: null }),
    supabase.from('budget_refunds').select('status, amount_cents').eq('brand_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const r = ranks.data?.[0];
  const allTimeRank = r?.all_time_rank == null ? null : Number(r.all_time_rank);

  const live = member.brand.status === 'active';
  const [moveUp, ladder] = await Promise.all([
    live && allTimeRank && allTimeRank > 1 ? db.rpc('claim_price', { p_brand_id: id, p_rank: allTimeRank - 1 }) : Promise.resolve({ data: null }),
    live ? db.rpc('claim_price_ladder', { p_brand_id: id }) : Promise.resolve({ data: [] as Array<{ target_rank: number; price_cents: number }> }),
  ]);

  const s = summary.data?.[0];
  const re = refundEligibility.data && typeof refundEligibility.data === 'object'
    ? refundEligibility.data as { eligible?: unknown; reason?: unknown; amount_cents?: unknown } : null;
  const remaining = Number(s?.remaining_cents ?? member.brand.budgetCents);
  return {
    allTimeRank,
    todayRank: r?.today_rank == null ? null : Number(r.today_rank),
    todayCents: Number(r?.today_cents ?? 0),
    moveUpPriceCents: moveUp.data == null ? null : Number(moveUp.data),
    ladder: (ladder.data ?? []).map((l) => ({ rank: Number(l.target_rank), priceCents: Number(l.price_cents) })),
    minBidCents: Number(settings.data?.find((setting) => setting.key === 'min_bid_cents')?.value ?? 1000),
    floorCents: Number(settings.data?.find((setting) => setting.key === 'floor_cents')?.value ?? 10),
    budget: {
      remaining, added: Number(s?.added_cents ?? 0), spent: Number(s?.spent_cents ?? 0), refunded: Number(s?.refunded_cents ?? 0),
      owed: Number(s?.waitlisted_cents ?? 0), owedCount: Number(s?.waitlisted_count ?? 0),
      visitorsLeft: member.brand.rateCents > 0 ? visitorsAffordable(remaining, member.brand.rateCents) : 0,
    },
    bids: (bids.data ?? []).map((b) => ({ id: b.id, amountCents: Number(b.amount_cents), budgetCents: Number(b.budget_cents), revenueCents: Number(b.revenue_cents), paymentId: b.processor_payment_id, status: b.status, createdAt: b.created_at })),
    refundEligibility: re ? {
      eligible: re.eligible === true,
      reason: typeof re.reason === 'string' ? re.reason : null,
      amountCents: Number(re.amount_cents ?? 0),
    } : null,
    refund: refund.data ? { status: refund.data.status, amountCents: Number(refund.data.amount_cents) } : null,
  };
}
