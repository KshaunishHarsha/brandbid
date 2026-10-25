import { NextResponse } from 'next/server';
import { listingUtm, parseSafeUrl } from '@brandbid/shared';
import { getBrandUrlBySlug } from '@/lib/brand';

// Organic click-through from a brand page or the leaderboard (BUILD section 13, step D). No promoter is involved,
// so nothing is recorded or paid: the brand just sees brandbid traffic tagged utm_medium=listing in its own analytics.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = await getBrandUrlBySlug(slug);
  if (!url) return new NextResponse('Not found', { status: 404 });

  let target: string;
  try {
    // Belt and braces: the stored URL was validated at listing time; never redirect anywhere that would not pass now.
    target = listingUtm(parseSafeUrl(url).toString());
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.redirect(target, 302);
}
