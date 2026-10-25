import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brandbid/db';

/**
 * The account for an email, created on the spot if new (D45: brands pay without a sign-in wall).
 * New accounts are unconfirmed; the emailed magic link confirms them. Service-role client only.
 */
export async function ensureUserByEmail(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({ email: normalized, email_confirm: false });
  if (!error && data.user) return { id: data.user.id, created: true };

  // Already registered: look the account up.
  const { data: id, error: lookupError } = await admin.rpc('find_user_id_by_email', { p_email: normalized });
  if (!lookupError && id) return { id, created: false };

  throw new Error(`Could not create or find a user for that email: ${error?.message ?? lookupError?.message ?? 'unknown'}`);
}
