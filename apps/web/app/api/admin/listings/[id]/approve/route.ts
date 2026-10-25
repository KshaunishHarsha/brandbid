import { NextResponse } from 'next/server';
import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const { data, error } = await createAdminClient().rpc('approve_listing', { p_brand_id: id, p_admin_id: guard.adminId });
  if (error) return backToQueue(req, adminErrorNotice(error.message));
  return backToQueue(req, (data as { changed?: boolean } | null)?.changed ? 'Listing approved. It is live.' : 'That listing was already live.');
}
