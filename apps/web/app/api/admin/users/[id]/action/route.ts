import { NextResponse } from 'next/server';
import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const form = await req.formData();
  const action = form.get('action');
  const reason = form.get('reason');
  if (action !== 'suspend' && action !== 'ban') return backToQueue(req, 'Choose suspend or ban.', '/admin/users');
  if (typeof reason !== 'string' || reason.trim().length < 3) return backToQueue(req, 'Please give a reason (at least 3 characters).', '/admin/users');

  const rpc = action === 'ban' ? 'admin_ban_promoter' : 'admin_suspend_promoter';
  const { data, error } = await createAdminClient().rpc(rpc, {
    p_promoter_id: id, p_reason: reason.trim().slice(0, 500), p_admin_id: guard.adminId,
  });
  if (error) return backToQueue(req, adminErrorNotice(error.message), '/admin/users');
  const result = data && typeof data === 'object' ? (data as { changed?: boolean }) : {};
  const notice = !result.changed ? `Account is already ${action === 'ban' ? 'banned' : 'suspended'}.` : action === 'ban' ? 'Account banned; any positive balance was forfeited.' : 'Account suspended and links disabled.';
  return backToQueue(req, notice, '/admin/users');
}
