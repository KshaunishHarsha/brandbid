import { headers } from 'next/headers';
import { getClientIp, hashValue } from '@/lib/request';
import { createAdminClient } from '@/lib/supabase/admin';

/** Collect hashed member visits from a brand dashboard for the later self-promotion rule. */
export async function recordMemberSignal(brandId: string, userId: string): Promise<void> {
  const h = await headers();
  const [ipHash, uaHash] = await Promise.all([
    hashValue(getClientIp(h)),
    hashValue(h.get('user-agent') ?? ''),
  ]);
  const { error } = await createAdminClient().from('member_signals').insert({
    brand_id: brandId, user_id: userId, ip_hash: ipHash, ua_hash: uaHash,
  });
  if (error) console.error('[member-signals] insert failed:', error.message);
}
