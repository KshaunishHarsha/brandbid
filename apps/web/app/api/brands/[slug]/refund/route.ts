import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/same-origin';
import { getMemberBrand } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { slug } = await params;
  const member = await getMemberBrand(slug);
  if (!member || member.brand.role !== 'owner' || member.brand.status !== 'active') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const target = new URL(`/dash/brands/${encodeURIComponent(member.brand.slug)}`, req.url);
  const { data, error } = await createAdminClient().rpc('refund_budget', { p_brand_id: member.brand.id, p_requester: member.user.id });
  const messages: Record<string, string> = {
    brand_owner_required: 'Only the brand owner can request a budget refund.',
    brand_not_active: 'Only active brands can request an unspent budget refund.',
    no_budget_remaining: 'There is no ad budget left to refund.',
    waitlist_owed: 'Waiting visitors must be paid before the remaining budget can be refunded.',
    refund_already_open: 'A refund request is already open for this brand.',
    budget_not_stagnant: 'The budget has not been inactive for 30 days yet.',
    refund_budget_allocation_failed: 'The remaining budget could not be matched safely to its payments. Support has been notified.',
  };
  if (error) target.searchParams.set('notice', messages[error.message] ?? 'The refund request could not be created. Nothing was changed.');
  else {
    const result = data && typeof data === 'object' ? data as { status?: unknown; manual_cents?: unknown } : {};
    const manual = Number(result.manual_cents ?? 0);
    target.searchParams.set('notice', manual > 0
      ? 'Refund request recorded. Some or all payments need manual review because the processor refund window is not configured or has elapsed.'
      : 'Refund request recorded. Processor delivery requires the configured refund window and account setup.');
  }
  return NextResponse.redirect(target, 303);
}
