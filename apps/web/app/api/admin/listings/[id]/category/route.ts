import { NextResponse } from 'next/server';
import { adminErrorNotice, backToQueue, requireAdminApi, UUID_RE } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const categoryId = Number(form?.get('categoryId'));
  if (!Number.isInteger(categoryId) || categoryId < 1) return backToQueue(req, adminErrorNotice('category_not_found'));

  const { data, error } = await createAdminClient().rpc('admin_set_category', { p_brand_id: id, p_category_id: categoryId, p_admin_id: guard.adminId });
  if (error) return backToQueue(req, adminErrorNotice(error.message));
  return backToQueue(req, (data as { changed?: boolean } | null)?.changed ? 'Category updated.' : 'Category was already set.');
}
