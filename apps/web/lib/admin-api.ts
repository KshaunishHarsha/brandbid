import { NextResponse } from 'next/server';
import { getUser, isRecentSignIn } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/same-origin';

export { isSameOrigin };

export type AdminCheck = { ok: true; adminId: string } | { ok: false; response: NextResponse };

/** Gate for every /api/admin/* handler: same origin, signed in, an admin, signed in within 12 h (BUILD section 20). */
export async function requireAdminApi(req: Request): Promise<AdminCheck> {
  if (!isSameOrigin(req)) return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };

  const user = await getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  // Don't reveal that admin endpoints exist to people who are not admins.
  if (!profile?.is_admin) return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) };

  if (!isRecentSignIn(user.last_sign_in_at)) {
    return { ok: false, response: NextResponse.json({ error: 'sign_in_again' }, { status: 401 }) };
  }
  return { ok: true, adminId: user.id };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Redirect back to the queue with a one-line notice. Always 303 so the browser turns the POST into a GET. */
export function backToQueue(req: Request, notice: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(new URL(`/admin/listings?notice=${encodeURIComponent(notice)}`, base), 303);
}

/** Database error messages we raise on purpose, mapped to what an admin should read. */
export const ADMIN_ERRORS: Record<string, string> = {
  brand_not_found: 'That listing no longer exists.',
  brand_not_reviewable: 'That listing is not waiting for review (it may already have been handled).',
  reason_required: 'Please give a reason (at least 3 characters).',
  category_not_found: 'That category does not exist.',
  brand_ledger_inconsistent: 'Refusing to refund: this listing\'s budget does not add up. Needs a developer.',
};
export function adminErrorNotice(message: string): string {
  return ADMIN_ERRORS[message] ?? 'Something went wrong. Nothing was changed.';
}
