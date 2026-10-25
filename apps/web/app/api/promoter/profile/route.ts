import { NextResponse } from 'next/server';
import { handleSchema } from '@brandbid/shared';
import { getUser } from '@/lib/auth';
import { canAdvertise } from '@/lib/beta';
import { isCountryCode } from '@/lib/countries';
import { handleAvailable } from '@/lib/promoter';
import { getLimiter } from '@/lib/ratelimit';
import { safeNext } from '@/lib/safe-next';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = await getUser();
  if (!user?.email_confirmed_at) return NextResponse.json({ error: 'email_unverified' }, { status: 403 });
  if (!(await canAdvertise(user.email))) return NextResponse.json({ error: 'beta_closed' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = handleSchema.safeParse(body?.handle);
  const country = typeof body?.country === 'string' ? body.country.toUpperCase() : '';
  if (!parsed.success || !isCountryCode(country) || body?.acceptTerms !== true) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (!(await getLimiter('promoter-profile', 10, 3600).limit(user.id)).success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (!(await handleAvailable(parsed.data, user.id))) return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
  const db = createAdminClient();
  const { error } = await db.from('profiles').update({
    handle: parsed.data,
    country,
    promoter_terms_accepted_at: new Date().toISOString(),
  }).eq('id', user.id).select('id').single();
  if (error?.code === '23505') return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({ next: safeNext(body?.next, '/earn') });
}
