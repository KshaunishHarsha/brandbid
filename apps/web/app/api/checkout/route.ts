import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bareHost, parseSafeUrl, randomCode, sniffImage, slugCandidates, slugify, toCents, UnsafeUrlError } from '@brandbid/shared';
import { getUser } from '@/lib/auth';
import { saveLogo, saveLogoFromUrl, MAX_LOGO_BYTES } from '@/lib/logos';
import { checkoutKeyId, getProcessor, paymentsMode } from '@/lib/payments';
import { getLimiter } from '@/lib/ratelimit';
import { getClientIp, hashValue } from '@/lib/request';
import { statusToken } from '@/lib/status-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTurnstile } from '@/lib/turnstile';
import { ensureUserByEmail } from '@/lib/users';

const MAX_BID_CENTS = 10_000_000; // $100,000: guards against typos

const Fields = z.object({
  url: z.string().max(2048),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(160),
  categoryId: z.coerce.number().int().positive(),
  amount: z.string().max(20),
  imageUrl: z.string().max(2048).optional(),
  email: z.string().trim().toLowerCase().max(254).optional(),
  emailConfirm: z.string().trim().toLowerCase().max(254).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

const err = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

// Step 3 of listing (D45): create the account (if needed), a draft brand, and a payment order.
// The brand only becomes real when the payment webhook calls record_bid.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return err('invalid', 400);
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') raw[k] = v;
  const logoFile = form.get('logo');

  const parsed = Fields.safeParse(raw);
  if (!parsed.success) return err('invalid', 400, { fields: Object.keys(parsed.error.flatten().fieldErrors) });
  const f = parsed.data;

  // Who is paying: a signed-in user, or a guest identified by one email typed twice.
  const user = await getUser();
  let email = user?.email ?? null;
  if (!user) {
    const ok = z.email().safeParse(f.email).success;
    if (!ok || f.email !== f.emailConfirm) return err('email_mismatch', 400);
    email = f.email!;
  }

  // Early, generous per-IP limit: stops request floods without punishing someone who mistypes a few times.
  const ip = getClientIp(req.headers);
  if (!(await getLimiter('checkout-ip', 30, 3600).limit(await hashValue(ip))).success) return err('rate_limited', 429);

  let amountCents: number;
  try {
    amountCents = toCents(f.amount);
  } catch {
    return err('invalid_amount', 400);
  }

  const admin = createAdminClient();
  const { data: settingRows } = await admin.from('settings').select('key, value').in('key', ['min_bid_cents', 'floor_cents']);
  const setting = (key: string) => Number(settingRows?.find((r) => r.key === key)?.value);
  const minBid = setting('min_bid_cents');
  const floor = setting('floor_cents');
  if (!Number.isFinite(minBid) || !Number.isFinite(floor)) return err('server_misconfigured', 500);
  if (amountCents < minBid) return err('below_minimum', 400, { minCents: minBid });
  if (amountCents > MAX_BID_CENTS) return err('above_maximum', 400);

  let url: URL;
  try {
    url = parseSafeUrl(f.url);
  } catch (e) {
    return err('invalid_url', 400, { reason: e instanceof UnsafeUrlError ? e.reason : 'invalid' });
  }

  const { data: category } = await admin.from('categories').select('id').eq('id', f.categoryId).maybeSingle();
  if (!category) return err('invalid_category', 400);

  let logoBytes: Uint8Array | null = null;
  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) return err('logo_too_large', 400);
    logoBytes = new Uint8Array(await logoFile.arrayBuffer());
    if (!sniffImage(logoBytes)) return err('invalid_logo', 400);
  }

  // One listing per site: an existing pending/active brand on the same host blocks a second one.
  const host = bareHost(url);
  const { data: existing } = await admin
    .from('brands')
    .select('slug, url')
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
  if (dup) return err('already_listed', 409, { slug: dup.slug });

  // From here on we create accounts and drafts, so this is where the strict checks live. They come after all
  // validation so a typo never uses up an attempt or a (single-use) bot-check token.
  if (!(await getLimiter('checkout-email', 5, 3600).limit(await hashValue(email ?? 'signed-in'))).success) {
    return err('rate_limited', 429);
  }
  if (!(await verifyTurnstile(f.turnstileToken, ip))) return err('bot_check_failed', 400);

  // Account (existing, or created now and confirmed by the emailed link).
  let ownerId: string;
  try {
    ownerId = user ? user.id : (await ensureUserByEmail(admin, email!)).id;
  } catch (e) {
    console.error('[checkout] ensureUser failed:', e);
    return err('account_unavailable', 500);
  }

  // Draft brand, with a unique slug.
  const base = slugify(f.name);
  const candidates = [...slugCandidates(base), `${base.slice(0, 35)}-${randomCode(4).toLowerCase()}`];
  let brand: { id: string; slug: string } | null = null;
  for (const slug of candidates) {
    const { data, error } = await admin
      .from('brands')
      .insert({
        slug,
        name: f.name,
        url: url.toString(),
        description: f.description,
        category_id: f.categoryId,
        owner_id: ownerId,
        rate_cents: floor,
        status: 'draft',
      })
      .select('id, slug')
      .single();
    if (!error && data) {
      brand = data;
      break;
    }
    if (error?.code !== '23505') {
      console.error('[checkout] brand insert failed:', error);
      return err('could_not_create', 500);
    }
  }
  if (!brand) return err('could_not_create', 500);

  const { error: memberError } = await admin.from('brand_members').insert({ brand_id: brand.id, user_id: ownerId, role: 'owner' });
  if (memberError) {
    console.error('[checkout] brand_members insert failed:', memberError);
    return err('could_not_create', 500);
  }

  // Logo: their upload wins; otherwise host the site's own Open Graph image. Best effort.
  if (logoBytes) await saveLogo(admin, brand.id, logoBytes);
  else if (f.imageUrl) await saveLogoFromUrl(admin, brand.id, f.imageUrl);

  try {
    const order = await getProcessor().createOrder({
      amountCents,
      receipt: `brand_${brand.id.slice(0, 8)}`,
      notes: { brand_id: brand.id, payer_id: ownerId },
    });
    return NextResponse.json({
      brandId: brand.id,
      slug: brand.slug,
      statusToken: await statusToken(brand.id),
      payerId: ownerId,
      email,
      order: { ...order, keyId: checkoutKeyId(), mode: paymentsMode() },
    });
  } catch (e) {
    console.error('[checkout] createOrder failed:', e);
    return err('payment_unavailable', 502); // the draft is cleaned up by the worker after 7 days
  }
}
