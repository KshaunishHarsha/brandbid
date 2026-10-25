import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/same-origin';
import { getMemberBrand } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';
import { newBrandInviteToken, hashBrandInviteToken } from '@/lib/brand-invites';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { slug } = await params;
  const member = await getMemberBrand(slug);
  if (!member || member.brand.role !== 'owner' || member.brand.status !== 'active') return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const rawEmail = form?.get('email');
  const target = new URL(`/dash/brands/${encodeURIComponent(member.brand.slug)}`, req.url);
  if (typeof rawEmail !== 'string' || rawEmail.trim().length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail.trim())) {
    target.searchParams.set('notice', 'Enter a valid email address for the teammate.');
    return NextResponse.redirect(target, 303);
  }

  const token = newBrandInviteToken();
  const tokenHash = await hashBrandInviteToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await createAdminClient().rpc('create_brand_invite', {
    p_brand_id: member.brand.id, p_invited_by: member.user.id, p_email: rawEmail.trim().toLowerCase(),
    p_token_hash: tokenHash, p_token: token, p_expires_at: expiresAt,
  });
  const messages: Record<string, string> = {
    brand_owner_required: 'Only the brand owner can invite team members.',
    brand_member_already_exists: 'That person already has access to this brand.',
    invite_email_invalid: 'Enter a valid email address for the teammate.',
    brand_not_invitable: 'Only active brands can invite teammates.',
  };
  target.searchParams.set('notice', error ? messages[error.message] ?? 'The invitation could not be sent. Please try again.' : 'Invitation queued. The teammate must sign in with that email and accept within 7 days.');
  return NextResponse.redirect(target, 303);
}
