import { NextResponse } from 'next/server';
import { addUtm, parseSafeUrl } from '@brandbid/shared';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';

const clickIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ click: string }> }) {
  const { click: clickId } = await params;
  const redirect = (url: string | URL) => {
    const response = NextResponse.redirect(url, 302);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  const fallback = () => redirect(new URL('/', req.url));
  if (!clickIdPattern.test(clickId)) return fallback();

  try {
    const admin = createAdminClient();
    const { data: click, error: clickError } = await admin.from('clicks')
      .select('id, brand_id, link_id, promoter_id').eq('id', clickId).maybeSingle();
    if (clickError) throw clickError;
    if (!click) return fallback();

    const [{ data: brand, error: brandError }, { data: link, error: linkError }, { data: promoter, error: promoterError }] = await Promise.all([
      admin.from('brands').select('url').eq('id', click.brand_id).eq('status', 'active').maybeSingle(),
      admin.from('links').select('channel').eq('id', click.link_id).maybeSingle(),
      admin.from('public_profiles').select('handle').eq('id', click.promoter_id).maybeSingle(),
    ]);
    if (brandError || linkError || promoterError) throw brandError ?? linkError ?? promoterError;
    if (!brand || !link) return fallback();

    const safeUrl = parseSafeUrl(brand.url).toString();
    const target = addUtm(safeUrl, {
      source: 'brandbid', medium: 'promoter',
      campaign: promoter?.handle ?? click.promoter_id, content: link.channel,
    });
    const { error: updateError } = await admin.from('clicks').update({ outbound_at: new Date().toISOString() })
      .eq('id', clickId).is('outbound_at', null);
    if (updateError) throw updateError;
    return redirect(target);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'outbound' } });
    return fallback();
  }
}
