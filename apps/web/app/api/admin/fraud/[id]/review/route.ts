import { NextResponse } from 'next/server';
import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const form = await req.formData();
  const decision = form.get('decision');
  const reason = form.get('reason');
  if (decision !== 'clear' && decision !== 'confirm') return backToQueue(req, 'Choose clear or confirm.', '/admin/fraud');
  if (typeof reason !== 'string' || (decision === 'confirm' && reason.trim().length < 3)) {
    return backToQueue(req, 'Please give a reason (at least 3 characters) to confirm a flag.', '/admin/fraud');
  }

  const { data, error } = await createAdminClient().rpc('review_fraud_flag', {
    p_flag_id: id,
    p_decision: decision,
    p_reason: reason.trim().slice(0, 500),
    p_admin_id: guard.adminId,
  });
  if (error) return backToQueue(req, adminErrorNotice(error.message), '/admin/fraud');
  const result = data && typeof data === 'object' ? (data as { changed?: boolean; decision?: string }) : {};
  const notice = !result.changed ? 'That flag has already been reviewed.' : decision === 'confirm' ? 'Earning reversed and budget recovery started.' : 'Flag cleared. The earning is released when its other flags are clear.';
  return backToQueue(req, notice, '/admin/fraud');
}
