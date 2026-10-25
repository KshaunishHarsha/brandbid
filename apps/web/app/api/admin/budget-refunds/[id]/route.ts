import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return backToQueue(req, 'That refund item is invalid.', '/admin/refunds');
  const form = await req.formData();
  const reference = form.get('reference');
  if (typeof reference !== 'string' || reference.trim().length < 3) return backToQueue(req, 'Enter the completed refund reference.', '/admin/refunds');
  const { error } = await createAdminClient().rpc('admin_complete_budget_refund_item', {
    p_admin_id: guard.adminId, p_item_id: id, p_reference: reference.trim().slice(0, 200),
  });
  return backToQueue(req, error ? adminErrorNotice(error.message) : 'Manual refund recorded and audited.', '/admin/refunds');
}
