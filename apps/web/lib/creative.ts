import { isValidCode } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoPublicUrl } from '@/lib/logos';

export type LinkCreative = {
  brandId: string;
  name: string;
  description: string;
  logoPath: string | null;
  logoData: string | null;
  rank: number | null;
};

/** Public, active-brand data for preview cards. Invalid or disabled links have no creative. */
export async function getLinkCreative(code: string): Promise<LinkCreative | null> {
  if (!isValidCode(code)) return null;
  const db = createAdminClient();
  const { data: link, error: linkError } = await db.from('links').select('brand_id, status').eq('code', code).maybeSingle();
  if (linkError || !link || link.status !== 'active') return null;
  const { data: brand, error: brandError } = await db.from('brands')
    .select('id, name, description, logo_path').eq('id', link.brand_id).eq('status', 'active').maybeSingle();
  if (brandError || !brand) return null;
  const { data: ranks } = await db.rpc('brand_ranks', { p_brand_id: brand.id });
  const rank = ranks?.[0]?.all_time_rank == null ? null : Number(ranks[0].all_time_rank);
  let logoData: string | null = null;
  const logoUrl = logoPublicUrl(brand.logo_path);
  if (logoUrl) {
    try {
      const response = await fetch(logoUrl, { signal: AbortSignal.timeout(3000) });
      const mime = response.headers.get('content-type')?.split(';')[0];
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (response.ok && bytes.length <= 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp'].includes(mime ?? '')) {
        logoData = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
      }
    } catch {
      // The card renders its monogram if storage is unavailable or the logo is broken.
    }
  }
  return { brandId: brand.id, name: brand.name, description: brand.description ?? '', logoPath: brand.logo_path, logoData, rank };
}

export function monogram(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B';
}

export async function storyCachePath(creative: LinkCreative): Promise<string> {
  // Uploads overwrite <brandId>.<ext>, so logoPath alone cannot invalidate an old card.
  // Fingerprint every field rendered into the card; a temporarily unavailable logo also
  // gets a distinct monogram cache entry and will switch paths when the image loads again.
  const source = JSON.stringify({
    logo: creative.logoData,
    name: creative.name,
    description: creative.description,
    rank: creative.rank,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const hash = Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${creative.brandId}/${creative.rank ?? 'unranked'}-${hash}.png`;
}
