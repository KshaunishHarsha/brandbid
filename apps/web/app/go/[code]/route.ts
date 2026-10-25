import { after, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as Sentry from '@sentry/nextjs';
import { isbot } from 'isbot';
import { CONSENT_COUNTRIES, isPreviewFetcher, isValidCode, ipUaKey } from '@brandbid/shared';
import { viewerIdFromAuthCookie } from '@/lib/auth-cookie';
import { getClientIp, hashValue } from '@/lib/request';
import { getLimiter } from '@/lib/ratelimit';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type LinkTarget = { linkId: string; brandId: string; promoterId: string; slug: string; name: string; description: string; status: string; brandStatus: string; promoterStatus: string };
const linkCache = new Map<string, { value: LinkTarget | null; expiresAt: number }>();
const CACHE_MS = 60_000;

function cacheTarget(code: string, value: LinkTarget | null, expiresAt: number) {
  if (linkCache.size >= 5000) {
    for (const [key, item] of linkCache) {
      if (item.expiresAt <= Date.now()) linkCache.delete(key);
      if (linkCache.size < 4000) break;
    }
    while (linkCache.size >= 5000) linkCache.delete(linkCache.keys().next().value!);
  }
  linkCache.set(code, { value, expiresAt });
}

async function getLinkTarget(code: string): Promise<LinkTarget | null> {
  const now = Date.now();
  const cached = linkCache.get(code);
  if (cached && cached.expiresAt > now) return cached.value;
  const db = createAdminClient();
  const { data: link, error } = await db.from('links').select('id, brand_id, promoter_id, status').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!link) { cacheTarget(code, null, now + CACHE_MS); return null; }
  const [{ data: brand, error: brandError }, { data: promoter, error: promoterError }] = await Promise.all([
    db.from('brands').select('slug, name, description, status').eq('id', link.brand_id).maybeSingle(),
    db.from('profiles').select('status').eq('id', link.promoter_id).maybeSingle(),
  ]);
  if (brandError) throw brandError;
  if (promoterError) throw promoterError;
  const value = brand && promoter ? {
    linkId: link.id, brandId: link.brand_id, promoterId: link.promoter_id,
    slug: brand.slug, name: brand.name, description: brand.description ?? '',
    status: link.status, brandStatus: brand.status, promoterStatus: promoter.status,
  } : null;
  cacheTarget(code, value, now + CACHE_MS);
  return value;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function previewHtml(req: Request, code: string, target: LinkTarget): Response {
  const title = `${target.name} on brandbid`;
  const description = target.description || `${target.name} is on the brandbid leaderboard.`;
  const image = new URL(`/api/og/${code}`, req.url).toString();
  const page = new URL(`/b/${target.slug}`, req.url).toString();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${escapeHtml(page)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(image)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(page)}"></head><body><a href="${escapeHtml(page)}">${escapeHtml(title)}</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
}

function cookieFromHeader(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      try { return decodeURIComponent(trimmed.slice(name.length + 1)); } catch { return null; }
    }
  }
  return null;
}

function randomVisitorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function recordInBackground(task: Promise<void>): void {
  void task.catch((error) => Sentry.captureException(error, { tags: { route: 'go', stage: 'record_click' } }));
  try { getCloudflareContext().ctx.waitUntil(task); }
  catch { after(() => task); }
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidCode(code)) return NextResponse.redirect(new URL('/', req.url), 302);
  let target: LinkTarget | null;
  try { target = await getLinkTarget(code); }
  catch (error) { Sentry.captureException(error, { tags: { route: 'go', stage: 'lookup' } }); return NextResponse.redirect(new URL('/', req.url), 302); }
  if (!target || target.status !== 'active' || target.brandStatus !== 'active') return NextResponse.redirect(new URL('/', req.url), 302);

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 512);
  if (isbot(userAgent) || isPreviewFetcher(userAgent)) return previewHtml(req, code, target);
  if (/\bprefetch\b/i.test(req.headers.get('sec-purpose') ?? '') || /\bprefetch\b/i.test(req.headers.get('purpose') ?? '')) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const ip = getClientIp(req.headers);
  const pepper = process.env.IP_PEPPER;
  if (!pepper && process.env.NODE_ENV === 'production') throw new Error('IP_PEPPER is not set');
  const safePepper = pepper ?? 'dev-pepper-not-secret';
  const [ipHash, uaHash] = await Promise.all([hashValue(ip), hashValue(userAgent)]);
  let rateLimited = false;
  try { rateLimited = !(await getLimiter('go', 30, 60).limit(ipHash)).success; }
  catch (error) { rateLimited = true; Sentry.captureException(error, { tags: { route: 'go', stage: 'rate_limit' } }); }

  const countryValue = req.headers.get('cf-ipcountry')?.toUpperCase() ?? '';
  const country = /^[A-Z]{2}$/.test(countryValue) ? countryValue : null;
  const cookieHeader = req.headers.get('cookie') ?? '';
  let cookieId = cookieFromHeader(cookieHeader, 'bb_vid');
  if (cookieId && !/^[0-9a-f]{32}$/i.test(cookieId)) cookieId = null;
  let setCookie: string | null = null;
  if (!cookieId && (!country || !CONSENT_COUNTRIES.has(country))) {
    cookieId = randomVisitorId();
    setCookie = `bb_vid=${encodeURIComponent(cookieId)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  }
  const [cookieHash, ipuaHash, viewerUserId] = await Promise.all([
    cookieId ? hashValue(cookieId) : Promise.resolve(null),
    ipUaKey(safePepper, ipHash, uaHash),
    viewerIdFromAuthCookie(cookieHeader),
  ]);
  const clickId = crypto.randomUUID();
  const destination = new URL(`/b/${target.slug}?c=${clickId}&l=${code}`, req.url);
  const response = NextResponse.redirect(destination, 302);
  response.headers.set('Cache-Control', 'no-store');
  if (setCookie) response.headers.append('Set-Cookie', setCookie);

  const task = (async () => {
    const { error } = await createAdminClient().rpc('record_click', {
      p_click_id: clickId,
      p_link_id: target.linkId,
      p_brand_id: target.brandId,
      p_promoter_id: target.promoterId,
      p_viewer_user_id: viewerUserId ?? undefined,
      p_cookie_id: cookieId ?? undefined,
      p_cookie_hash: cookieHash ?? undefined,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
      p_ipua_hash: ipuaHash,
      p_user_agent: userAgent,
      p_country: country ?? undefined,
      p_referrer: req.headers.get('referer')?.slice(0, 2048) ?? undefined,
      p_rate_limited: rateLimited,
    });
    if (error) throw error;
  })();
  recordInBackground(task);
  return response;
}
