import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { PromoImage } from '@/components/PromoImage';
import { getLinkCreative } from '@/lib/creative';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const creative = await getLinkCreative(code);
  if (!creative) return new Response('Not found', { status: 404 });
  return new ImageResponse(createElement(PromoImage, { creative }), {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
