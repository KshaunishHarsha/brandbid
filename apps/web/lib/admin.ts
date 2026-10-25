import { createAdminClient } from '@/lib/supabase/admin';

export type PendingListing = {
  brandId: string; slug: string; name: string; description: string | null; url: string; logoPath: string | null;
  categoryId: number | null; categoryName: string | null; categoryRequiresReview: boolean;
  ownerEmail: string | null; reviewReason: string | null; checked: boolean;
  totalPaidCents: number; bidCount: number; createdAt: string;
};

export async function getPendingListings(): Promise<PendingListing[]> {
  const { data, error } = await createAdminClient().rpc('admin_pending_listings');
  if (error) throw new Error(`admin_pending_listings failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    brandId: r.brand_id, slug: r.slug, name: r.name, description: r.description, url: r.url, logoPath: r.logo_path,
    categoryId: r.category_id, categoryName: r.category_name, categoryRequiresReview: r.category_requires_review,
    ownerEmail: r.owner_email, reviewReason: r.review_reason, checked: r.checked_at !== null,
    totalPaidCents: Number(r.total_paid_cents), bidCount: Number(r.bid_count), createdAt: r.created_at,
  }));
}

export async function getAllCategories() {
  const { data, error } = await createAdminClient().from('categories').select('id, name, requires_review').order('name');
  if (error) throw new Error(`categories failed: ${error.message}`);
  return data ?? [];
}

export type AdminOverview = {
  pendingListings: number;
  refundsOwed: number;
  refundsStuck: number;
  recent: Array<{ id: number; action: string; actorId: string | null; subjectId: string | null; details: unknown; createdAt: string }>;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = createAdminClient();
  const [pending, owed, stuck, recent] = await Promise.all([
    db.from('brands').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    db.from('bids').select('id', { count: 'exact', head: true }).eq('status', 'refunded').is('refund_ref', null).lt('refund_attempts', 10),
    db.from('bids').select('id', { count: 'exact', head: true }).eq('status', 'refunded').is('refund_ref', null).gte('refund_attempts', 10),
    db.from('audit_log').select('id, action, actor_id, subject_id, details, created_at').order('id', { ascending: false }).limit(20),
  ]);
  return {
    pendingListings: pending.count ?? 0,
    refundsOwed: owed.count ?? 0,
    refundsStuck: stuck.count ?? 0,
    recent: (recent.data ?? []).map((a) => ({ id: a.id, action: a.action, actorId: a.actor_id, subjectId: a.subject_id, details: a.details, createdAt: a.created_at })),
  };
}

/** What the automatic check recorded, in words an admin can act on. */
export function explainReason(code: string): string {
  if (code === 'category_requires_review') return 'Sensitive category: needs a human look';
  if (code === 'blocked_domain') return 'Domain is on the blocklist';
  if (code === 'url_unreachable') return "Website didn't respond";
  if (code === 'url_invalid') return 'Website address is not valid';
  if (code.startsWith('banned_word:')) return `Contains a banned word: "${code.slice('banned_word:'.length)}"`;
  return code;
}
