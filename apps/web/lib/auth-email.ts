import { createClient } from '@supabase/supabase-js';
import { siteUrl } from './site';

/**
 * Email a one-time sign-in link to an existing account (no session needed).
 * Used after a brand pays as a guest: the link opens their dashboard (D45).
 */
export async function sendSignInLink(email: string, next = '/dash'): Promise<void> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) throw new Error(`sendSignInLink failed: ${error.message}`);
}
