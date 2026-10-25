import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return backToQueue(req, 'That withdrawal id is invalid.', '/admin/withdrawals');
  const form = await req.formData();
  const decision = form.get('decision');
  const rawReason = form.get('reason');
  if (decision !== 'approve' && decision !== 'hold') return backToQueue(req, 'Choose approve or hold.', '/admin/withdrawals');
  if (decision === 'hold' && (typeof rawReason !== 'string' || rawReason.trim().length < 3)) return backToQueue(req, 'Please give a reason (at least 3 characters).', '/admin/withdrawals');
  const { error } = await createAdminClient().rpc('admin_review_withdrawal', {
    p_admin_id: guard.adminId, p_withdrawal_id: id, p_decision: decision,
    p_reason: decision === 'hold' ? String(rawReason).trim().slice(0, 500) : null,
  });
  return backToQueue(req, error ? adminErrorNotice(error.message) : decision === 'approve' ? 'Withdrawal approved for processing.' : 'Withdrawal held and reason recorded.', '/admin/withdrawals');
}
