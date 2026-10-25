import { NextResponse } from 'next/server';
import { sniffImage } from '@brandbid/shared';
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

  const description = String(form.get('description') ?? '').trim();
  if (description.length < 10 || description.length > 160) return back(req, slug, 'The description must be 10 to 160 characters.');

  let logoBytes: Uint8Array | null = null;
  const file = form.get('logo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) return back(req, slug, 'The logo must be under 1 MB.');
    logoBytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImage(logoBytes)) return back(req, slug, 'The logo must be a PNG, JPEG or WebP image.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('brands').update({ description }).eq('id', member.brand.id).select('id');
  if (error || (data?.length ?? 0) !== 1) return back(req, slug, 'Could not save. Nothing was changed.');

  if (logoBytes && !(await saveLogo(createAdminClient(), member.brand.id, logoBytes))) {
    return back(req, slug, 'Description saved, but the logo could not be uploaded.');
  }
  return back(req, slug, logoBytes ? 'Saved. Description and logo updated.' : 'Saved.');
}
