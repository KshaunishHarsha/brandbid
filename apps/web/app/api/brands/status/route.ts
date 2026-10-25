import { NextResponse } from 'next/server';
import { verifyStatusToken } from '@/lib/status-token';
import { createAdminClient } from '@/lib/supabase/admin';

// Polled by /list/done. The token (issued at checkout) is the only credential: a guest has no session yet.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !token || !(await verifyStatusToken(id, token))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { data } = await createAdminClient()
    .from('brands')
    .select('slug, status, total_paid_cents, review_reason')
    .eq('id', id)
    .single();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // review_reason stays internal: the owner just learns it is being reviewed.
  return NextResponse.json({ slug: data.slug, status: data.status, paid: data.total_paid_cents > 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
