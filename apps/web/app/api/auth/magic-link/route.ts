import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLimiter } from '@/lib/ratelimit';
import { getClientIp, hashValue } from '@/lib/request';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';
import { verifyTurnstile } from '@/lib/turnstile';

const Body = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  turnstileToken: z.string().max(4096).optional(),
  next: z.string().max(500).optional(),
});

// BUILD section 10 step 1: 5 attempts per IP per 10 minutes, Turnstile on the form.
// An extra per-email limit stops someone using us to flood a victim's inbox.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  const { email, turnstileToken, next } = parsed.data;

  const ip = getClientIp(req.headers);
  const [ipOk, emailOk] = await Promise.all([
    getLimiter('signin-ip', 5, 600).limit(await hashValue(ip)),
    getLimiter('signin-email', 3, 600).limit(await hashValue(email)),
  ]);
  if (!ipOk.success || !emailOk.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: 'bot_check_failed' }, { status: 400 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${site}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`,
    },
  });
  if (error) console.error('[magic-link] signInWithOtp failed:', error.message);

  // Same answer whether or not the account exists or the send failed: reveals nothing to a prober.
  return NextResponse.json({ ok: true });
}
