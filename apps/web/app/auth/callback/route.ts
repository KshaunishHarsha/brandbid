import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

// OAuth (Google) return. Same browser as the one that started it, so the PKCE code exchange works.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
  }
  return NextResponse.redirect(new URL('/signin?error=oauth', origin), 303);
}
