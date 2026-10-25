import { createElement } from 'react';
import { ImageResponse } from 'next/og';
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
  const cached = await db.storage.from('story-cache').download(path);
  if (cached.data) {
    return new Response(await cached.data.arrayBuffer(), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  }
  const image = new ImageResponse(createElement(PromoImage, { creative, story: true }), { width: 1080, height: 1920 });
  const bytes = new Uint8Array(await image.arrayBuffer());
  // Local setups and hosted projects may not have the cache bucket yet; serve the generated image either way.
  await db.storage.from('story-cache').upload(path, bytes, { contentType: 'image/png', cacheControl: '3600', upsert: true });
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
