import { NextResponse } from 'next/server';
import { formatUSD, sniffImage, toCents } from '@brandbid/shared';
import { getMemberBrand } from '@/lib/dashboard';
import { MAX_LOGO_BYTES, saveLogo } from '@/lib/logos';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const back = (req: Request, slug: string, notice: string) =>
  NextResponse.redirect(new URL(`/dash/brands/${slug}?notice=${encodeURIComponent(notice)}`, process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin), 303);

// A member edits the description and/or logo of their brand. The description goes through the member's OWN session, so
// row-level security (members may change only description, logo and rate) is the real check; the logo needs the
// service role for storage, and is only touched after membership is confirmed.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { slug } = await params;
  const member = await getMemberBrand(slug);
  if (!member) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, slug, 'Could not read the form.');

  const updates: { description?: string; rate_cents?: number } = {};
  const rawDescription = form.get('description');
  if (typeof rawDescription === 'string') {
    const description = rawDescription.trim();
    if (description.length < 10 || description.length > 160) return back(req, slug, 'The description must be 10 to 160 characters.');
    updates.description = description;
  }

  const rawRate = form.get('rate');
  if (rawRate !== null) {
    if (typeof rawRate !== 'string') return back(req, slug, 'Enter a valid rate in dollars.');
    let rateCents: number;
    try { rateCents = toCents(rawRate); }
    catch { return back(req, slug, 'Enter a valid rate in dollars and cents.'); }
    if (rateCents <= 0) return back(req, slug, 'The rate must be greater than zero.');
    const { data: floorSetting, error: floorError } = await createAdminClient().from('settings').select('value').eq('key', 'floor_cents').maybeSingle();
    if (floorError || floorSetting?.value == null) return back(req, slug, 'The rate floor is temporarily unavailable. Please try again.');
    const floorCents = Number(floorSetting.value);
    if (!Number.isSafeInteger(floorCents) || floorCents <= 0) return back(req, slug, 'The rate floor is temporarily unavailable. Please try again.');
    if (rateCents < floorCents) return back(req, slug, `The rate must be at least ${formatUSD(floorCents)}.`);
    updates.rate_cents = rateCents;
  }

  let logoBytes: Uint8Array | null = null;
  const file = form.get('logo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) return back(req, slug, 'The logo must be under 1 MB.');
    logoBytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImage(logoBytes)) return back(req, slug, 'The logo must be a PNG, JPEG or WebP image.');
  }

  if (Object.keys(updates).length === 0 && !logoBytes) return back(req, slug, 'No changes to save.');

  if (Object.keys(updates).length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('brands').update(updates).eq('id', member.brand.id).select('id');
    if (error?.code === '23514' && error.message.includes('brand_rate_below_floor')) {
      return back(req, slug, 'The minimum rate changed. Refresh the page and choose a rate at or above the new floor.');
    }
    if (error || (data?.length ?? 0) !== 1) return back(req, slug, 'Could not save. Nothing was changed.');
  }

  if (logoBytes && !(await saveLogo(createAdminClient(), member.brand.id, logoBytes))) {
    return back(req, slug, 'Your other changes were saved, but the logo could not be uploaded.');
  }
  const saved = [updates.description ? 'description' : null, updates.rate_cents ? 'rate' : null, logoBytes ? 'logo' : null].filter(Boolean);
  return back(req, slug, `Saved${saved.length ? `: ${saved.join(', ')} updated.` : '.'}`);
}
