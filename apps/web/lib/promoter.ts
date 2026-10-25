import { handleSchema } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';

export async function handleAvailable(raw: string, currentUserId?: string): Promise<boolean> {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) return false;
  const handle = parsed.data;
  const db = createAdminClient();
  const [profile, brand] = await Promise.all([
    db.from('profiles').select('id').eq('handle', handle).maybeSingle(),
    db.from('brands').select('id').eq('slug', handle).maybeSingle(),
  ]);
  if (profile.error || brand.error) throw new Error('Handle availability unavailable');
  return !brand.data && (!profile.data || profile.data.id === currentUserId);
}
