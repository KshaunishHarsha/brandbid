import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export function signInUrl(next: string): string {
  return `/signin?next=${encodeURIComponent(next)}`;
}

export async function requireUser(nextPath = '/') {
  const user = await getUser();
  if (!user) redirect(signInUrl(nextPath));
  return user;
}

/** Admin actions need a sign-in within the last 12 hours (BUILD section 20). */
export function isRecentSignIn(
  lastSignInAt: string | null | undefined,
  maxHours = 12,
  now: number = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  if (Number.isNaN(t)) return false;
  return now - t <= maxHours * 3_600_000 && t <= now + 60_000;
}

export async function requireAdmin(nextPath = '/admin') {
  const user = await requireUser(nextPath);
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) notFound(); // don't reveal that /admin exists
  if (!isRecentSignIn(user.last_sign_in_at)) redirect(signInUrl(nextPath));
  return user;
}
