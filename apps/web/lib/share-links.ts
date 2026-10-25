import { linkUrl, randomCode } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';

export const SHARE_CHANNELS = ['story', 'linkedin', 'x', 'link'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export async function getShareLinks(promoterId: string, brandId: string) {
  const db = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandbid.wtf';
  const links: Record<ShareChannel, string> = {} as Record<ShareChannel, string>;
  for (const channel of SHARE_CHANNELS) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db.rpc('get_or_create_link', {
        p_promoter_id: promoterId,
        p_brand_id: brandId,
        p_channel: channel,
        p_code: randomCode(),
      });
      if (error?.code === '23505') continue;
      if (error) throw error;
      if (!data) throw new Error('Link unavailable');
      links[channel] = linkUrl(data.code, baseUrl);
      break;
    }
    if (!links[channel]) throw new Error('Link code collision limit reached');
  }
  return links;
}
