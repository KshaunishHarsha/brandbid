import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONSENT_COOKIE, VISITOR_COOKIE } from '@brandbid/shared';
import { isSameOrigin } from '@/lib/same-origin';
import { hashValue } from '@/lib/request';
import { createAdminClient } from '@/lib/supabase/admin';

const Input = z.object({ choice: z.enum(['yes', 'no']), clickId: z.string().uuid().optional().nullable() });
const cookieOptions = 'Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax';

function newVisitorId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  response.headers.append('Set-Cookie', `${CONSENT_COOKIE}=${parsed.data.choice}; ${cookieOptions}`);
  if (parsed.data.choice === 'no') {
    response.headers.append('Set-Cookie', `${VISITOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return response;
  }

  const visitorCookie = newVisitorId();
  response.headers.append('Set-Cookie', `${VISITOR_COOKIE}=${visitorCookie}; ${cookieOptions}`);
  if (parsed.data.clickId) {
    try {
      const admin = createAdminClient();
      let click: { brand_id: string; visitor_id: string | null } | null = null;
      // /go records clicks in the background. Give that write a short window to land before binding the consent key.
      for (let attempt = 0; attempt < 4 && !click; attempt++) {
        const { data } = await admin.from('clicks').select('brand_id,visitor_id').eq('id', parsed.data.clickId).maybeSingle();
        if (data) click = data;
        else if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (click?.visitor_id) {
        const keyHash = await hashValue(visitorCookie);
        await admin.from('visitor_keys').upsert(
          { brand_id: click.brand_id, key_type: 'cookie', key_hash: keyHash, visitor_id: click.visitor_id },
          { onConflict: 'brand_id,key_type,key_hash', ignoreDuplicates: true },
        );
        await admin.from('clicks').update({ cookie_id: visitorCookie }).eq('id', parsed.data.clickId).eq('visitor_id', click.visitor_id);
      }
    } catch {
      // Consent remains saved even if the background click has not arrived; /api/q can still use IP+UA matching.
    }
  }
  return response;
}
