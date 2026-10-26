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

    const admin = createAdminClient();
    // /go writes clicks with waitUntil, so its row can appear after the
    // consent POST has already tried to attach this cookie. Qualification
    // runs after the visitor has spent time on the page; retry the binding
    // here so a slow background click write cannot turn consent into a
    // cookie_mismatch rejection.
    if (cookieId) {
      try {
        let click: { brand_id: string; visitor_id: string } | null = null;
        for (let attempt = 0; attempt < 4 && !click; attempt++) {
          const { data } = await admin.from('clicks')
            .select('brand_id,visitor_id')
            .eq('id', parsed.data.clickId)
            .maybeSingle();
          if (data?.brand_id && data.visitor_id) {
            click = { brand_id: data.brand_id, visitor_id: data.visitor_id };
          }
          else if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (click) {
          const cookieHash = await hashValue(cookieId);
          await admin.from('visitor_keys').upsert({
            brand_id: click.brand_id,
            key_type: 'cookie',
            key_hash: cookieHash,
            visitor_id: click.visitor_id,
          }, { onConflict: 'brand_id,key_type,key_hash', ignoreDuplicates: true });
          await admin.from('clicks').update({ cookie_id: cookieId })
            .eq('id', parsed.data.clickId)
            .eq('visitor_id', click.visitor_id);
        }
      } catch (error) {
        Sentry.captureException(error, { tags: { route: 'qualify', stage: 'cookie_binding' } });
      }
    }

    const { error } = await admin.rpc('qualify_visitor', {
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
