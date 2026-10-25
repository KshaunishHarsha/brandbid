import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

// POST only, from the "Continue" button on /auth/confirm. Email security scanners GET links but do not
// press buttons, so they cannot burn the one-time token before the person does.
export async function POST(req: Request) {
  const form = await req.formData();
  const tokenHash = String(form.get('token_hash') ?? '');
  const type = String(form.get('type') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  if (!tokenHash || (type !== 'email' && type !== 'magiclink')) {
    return NextResponse.redirect(new URL('/signin?error=link', origin), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL('/signin?error=link', origin), 303);

  return NextResponse.redirect(new URL(next, origin), 303);
}
