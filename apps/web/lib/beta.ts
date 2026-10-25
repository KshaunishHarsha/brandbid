import { createAdminClient } from '@/lib/supabase/admin';

/** SQL null opens the beta. An array, including [], is an email allowlist. */
export function isBetaAllowed(value: unknown, email: string | null | undefined): boolean {
  if (value === null) return true;
  if (!Array.isArray(value) || !email) return false;
  return value.some((entry) => typeof entry === 'string' && entry.toLowerCase() === email.toLowerCase());
}

export async function getBetaAllowlist(): Promise<unknown> {
  const { data, error } = await createAdminClient().from('settings').select('value').eq('key', 'beta_allowlist').single();
  if (error) throw new Error(`beta_allowlist unavailable: ${error.message}`);
  return data.value;
}

export async function canAdvertise(email: string | null | undefined): Promise<boolean> {
  return isBetaAllowed(await getBetaAllowlist(), email);
}
