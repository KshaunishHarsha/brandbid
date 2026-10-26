import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import * as Sentry from '@sentry/nextjs';
import { PromoImage } from '@/components/PromoImage';
import { getLinkCreative, storyCachePath } from '@/lib/creative';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const creative = await getLinkCreative(code);
  if (!creative) return new Response('Not found', { status: 404 });
  const db = createAdminClient();
  const path = await storyCachePath(creative);
  try {
    const cached = await db.storage.from('story-cache').download(path);
    if (cached.error) Sentry.captureException(cached.error, { tags: { route: 'story', stage: 'cache_read' } });
    if (cached.data) {
      return new Response(await cached.data.arrayBuffer(), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
      });
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'story', stage: 'cache_read' } });
  }
  const image = new ImageResponse(createElement(PromoImage, { creative, story: true }), { width: 1080, height: 1920 });
  const bytes = new Uint8Array(await image.arrayBuffer());
  // Local setups and hosted projects may not have the cache bucket yet; serve the generated image either way.
  try {
    const uploaded = await db.storage.from('story-cache').upload(path, bytes, { contentType: 'image/png', cacheControl: '3600', upsert: true });
    if (uploaded.error) Sentry.captureException(uploaded.error, { tags: { route: 'story', stage: 'cache_write' } });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'story', stage: 'cache_write' } });
  }
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
