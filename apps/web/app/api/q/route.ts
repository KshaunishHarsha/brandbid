import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { CONSENT_COOKIE, CONSENT_COUNTRIES, VISITOR_COOKIE } from '@brandbid/shared';
import { getLimiter } from '@/lib/ratelimit';
import { getClientIp, hashValue } from '@/lib/request';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTurnstile } from '@/lib/turnstile';

const Input = z.object({
  clickId: z.string().uuid(),
  linkCode: z.string().regex(/^[A-Za-z0-9]{8}$/).optional(),
  activeMs: z.number().int().min(10_000).max(180_000),
  interactions: z.number().int().min(1).max(100),
  turnstileToken: z.string().max(4096).optional(),
  fingerprint: z.string().min(1).max(512).optional(),
});

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return noContent();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return noContent();

  try {
    const ip = getClientIp(req.headers);
    const [ipHash, uaHash] = await Promise.all([
      hashValue(ip),
      hashValue((req.headers.get('user-agent') ?? '').slice(0, 512)),
    ]);
    if (!(await getLimiter('qualify-ip', 10, 60).limit(ipHash)).success) return noContent();
    if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) return noContent();

    const cookieStore = await cookies();
    const country = req.headers.get('cf-ipcountry')?.toUpperCase() ?? '';
    const consentRequired = CONSENT_COUNTRIES.has(country);
    const consented = !consentRequired || cookieStore.get(CONSENT_COOKIE)?.value === 'yes';
    const rawCookie = cookieStore.get(VISITOR_COOKIE)?.value;
    const cookieId = consented && rawCookie && /^[0-9a-f]{32}$/i.test(rawCookie) ? rawCookie : null;
    const fingerprintHash = consented && parsed.data.fingerprint ? await hashValue(parsed.data.fingerprint) : null;

    const { error } = await createAdminClient().rpc('qualify_visitor', {
      p_click_id: parsed.data.clickId,
      p_fp_hash: fingerprintHash,
      p_cookie_id: cookieId,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
      p_active_ms: parsed.data.activeMs,
      p_interactions: parsed.data.interactions,
    });
    if (error) Sentry.captureException(error, { tags: { route: 'qualify', stage: 'rpc' } });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'qualify' } });
  }
  return noContent();
}
