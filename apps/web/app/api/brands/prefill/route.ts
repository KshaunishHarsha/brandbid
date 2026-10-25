import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bareHost, parseMeta, parseSafeUrl, safeFetch, UnsafeUrlError } from '@brandbid/shared';
import { getLimiter } from '@/lib/ratelimit';
import { getClientIp, hashValue } from '@/lib/request';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({ url: z.string().max(2048) });

const REASONS: Record<string, string> = {
  scheme: 'Use an https:// address.',
  ip_literal: 'Use a domain name, not an IP address.',
  credentials: 'Remove the username and password from the address.',
  port: 'Use the standard https address (no port).',
  hostname: 'That does not look like a public website address.',
  invalid: 'That does not look like a website address.',
  length: 'That address is too long.',
  whitespace: 'The address contains spaces or hidden characters.',
};

// Step 1 of listing: fetch the page server-side and suggest a name, description and logo.
// SSRF-safe (BUILD section 8): https only, public hosts only, 3 redirects max, 5 s, 1 MB.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const limit = await getLimiter('prefill-ip', 20, 600).limit(await hashValue(getClientIp(req.headers)));
  if (!limit.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let url: URL;
  try {
    url = parseSafeUrl(parsed.data.url);
  } catch (e) {
    const reason = e instanceof UnsafeUrlError ? e.reason : 'invalid';
    return NextResponse.json({ error: 'invalid_url', message: REASONS[reason] ?? REASONS.invalid }, { status: 400 });
  }

  // Already listed? (matched by host, ignoring www)
  const host = bareHost(url);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('brands')
    .select('slug, url, status')
    .in('status', ['pending_review', 'active'])
    .ilike('url', `%${host}%`)
    .limit(20);
  const dup = existing?.find((b) => {
    try {
      return bareHost(new URL(b.url)) === host;
    } catch {
      return false;
    }
  });
  if (dup) return NextResponse.json({ error: 'already_listed', slug: dup.slug }, { status: 409 });

  try {
    const page = await safeFetch(url.toString(), { headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (page.status >= 400 || !/html/i.test(page.contentType)) throw new Error(`unusable response: ${page.status} ${page.contentType}`);
    const meta = parseMeta(new TextDecoder('utf-8', { fatal: false }).decode(page.body), page.url.toString());
    return NextResponse.json({ url: page.url.toString(), ...meta });
  } catch {
    // Could not read the page: let them type the details in themselves.
    return NextResponse.json({ url: url.toString(), name: '', description: '', image: null, warning: 'could_not_read_page' });
  }
}
