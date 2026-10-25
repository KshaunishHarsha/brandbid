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
  const query = typeof form.get('q') === 'string' ? (form.get('q') as string).trim().slice(0, 120) : '';
  const back = `/admin/brands${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  if (action !== 'disable_ads' && action !== 'remove') return backToQueue(req, 'Choose disable ads or remove.', back);
  if (typeof reason !== 'string' || reason.trim().length < 3) return backToQueue(req, 'Please give a reason (at least 3 characters).', back);

  const rpc = action === 'remove' ? 'admin_remove_brand' : 'admin_disable_brand_ads';
  const { data, error } = await createAdminClient().rpc(rpc, {
    p_brand_id: id, p_reason: reason.trim().slice(0, 500), p_admin_id: guard.adminId,
  });
  if (error) return backToQueue(req, adminErrorNotice(error.message), back);
  const result = data && typeof data === 'object' ? (data as { changed?: boolean }) : {};
  const notice = !result.changed ? `Brand is already ${action === 'remove' ? 'removed' : 'disabled'}.` : action === 'remove' ? 'Brand removed; financial history was preserved.' : 'Ads and active links disabled.';
  return backToQueue(req, notice, back);
}
