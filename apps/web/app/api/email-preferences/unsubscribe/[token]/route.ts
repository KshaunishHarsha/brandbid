import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await createAdminClient().rpc('confirm_email_unsubscribe', { p_token_hash: tokenHash });
  const target = new URL(`/unsubscribe/${token}`, req.url);
  if (error) target.searchParams.set('notice', 'This unsubscribe link is invalid, expired, or already used.');
  else target.searchParams.set('done', '1');
  return NextResponse.redirect(target, 303);
}
