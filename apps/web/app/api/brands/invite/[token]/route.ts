import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/same-origin';
import { getUser } from '@/lib/auth';
import { hashBrandInviteToken, BRAND_INVITE_TOKEN_RE } from '@/lib/brand-invites';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { token } = await params;
  if (!BRAND_INVITE_TOKEN_RE.test(token)) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  const path = `/brands/invite/${token}`;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(path)}`, req.url), 303);

  const tokenHash = await hashBrandInviteToken(token);
  const { data, error } = await createAdminClient().rpc('accept_brand_invite', { p_user_id: user.id, p_token_hash: tokenHash });
  if (error) {
    const messages: Record<string, string> = {
      brand_invite_not_found: 'This invitation is no longer valid.',
      brand_invite_email_mismatch: 'Sign in with the email address the invitation was sent to.',
      brand_invite_expired: 'This invitation has expired. Ask the brand owner to send a new one.',
      brand_invite_already_accepted: 'This invitation has already been accepted.',
      brand_not_invitable: 'This brand cannot add team members right now.',
    };
    return NextResponse.redirect(new URL(`${path}?notice=${encodeURIComponent(messages[error.message] ?? 'The invitation could not be accepted.')}`, req.url), 303);
  }

  const result = data && typeof data === 'object' ? data as { brand_slug?: unknown } : {};
  if (typeof result.brand_slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(result.brand_slug)) {
    return NextResponse.redirect(new URL('/dash', req.url), 303);
  }
  return NextResponse.redirect(new URL(`/dash/brands/${encodeURIComponent(result.brand_slug)}?notice=${encodeURIComponent('You joined the brand team.')}`, req.url), 303);
}
