import { NextResponse } from 'next/server';
import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { getProcessor } from '@/lib/payments';
import { issueOwedRefunds } from '@/lib/refunds';
import { supabaseRefundStore } from '@/lib/refund-store';
import { createAdminClient } from '@/lib/supabase/admin';

// Reject a held listing: the database reverses every bid and the payer is refunded in full (D38). The processor refund
// is attempted right away; anything that fails is retried by the worker (process-refunds).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const reason = String(form?.get('reason') ?? '').trim().slice(0, 500);

  const db = createAdminClient();
  const { data, error } = await db.rpc('reject_listing', { p_brand_id: id, p_admin_id: guard.adminId, p_reason: reason });
  if (error) return backToQueue(req, adminErrorNotice(error.message));
  const result = data as { changed?: boolean; refund_cents?: number } | null;

  let note = '';
  try {
    const summary = await issueOwedRefunds(supabaseRefundStore(db), getProcessor(), id);
    note = summary.failed > 0 ? ' The payment refund hit a problem and will be retried automatically.' : ' The payment refund has been issued.';
  } catch (e) {
    console.error('[admin] immediate refund failed (worker will retry):', e);
    note = ' The payment refund will be issued shortly.';
  }
  return backToQueue(req, result?.changed ? `Listing rejected.${note}` : 'That listing was already rejected.');
}
