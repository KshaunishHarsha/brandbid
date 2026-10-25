import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getLimiter } from '@/lib/ratelimit';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = await getUser();
  if (!user?.email || !user.email_confirmed_at) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await getLimiter('beta-waitlist', 3, 3600).limit(user.id)).success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { error } = await createAdminClient().from('beta_waitlist').upsert({ email: user.email.toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
