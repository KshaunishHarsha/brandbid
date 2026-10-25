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
export function backToQueue(req: Request, notice: string, queue = '/admin/listings'): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const target = new URL(queue, base);
  target.searchParams.set('notice', notice);
  return NextResponse.redirect(target, 303);
}

/** Database error messages we raise on purpose, mapped to what an admin should read. */
export const ADMIN_ERRORS: Record<string, string> = {
  brand_not_found: 'That listing no longer exists.',
  brand_not_reviewable: 'That listing is not waiting for review (it may already have been handled).',
  reason_required: 'Please give a reason (at least 3 characters).',
  category_not_found: 'That category does not exist.',
  brand_ledger_inconsistent: 'Refusing to refund: this listing\'s budget does not add up. Needs a developer.',
  admin_required: 'Your admin session needs refreshing.',
  fraud_flag_not_found: 'That fraud flag no longer exists.',
  earning_not_found: 'The earning linked to that flag no longer exists.',
  earning_not_reversible: 'That earning can no longer be reversed.',
  earning_budget_ledger_inconsistent: 'Refusing to reverse: the earning reservation does not add up.',
  earning_ledger_missing: 'Refusing to reverse: the promoter ledger credit is missing.',
  subject_not_reviewable: 'This flag type cannot be confirmed through the earning review flow.',
  invalid_fraud_decision: 'Choose clear or confirm.',
  promoter_not_found: 'That promoter account no longer exists.',
  admin_target_protected: 'Admin accounts cannot be suspended or banned from this screen.',
  promoter_banned: 'That promoter is already banned.',
  refund_item_not_found: 'That budget refund item no longer exists.',
  refund_item_not_manual: 'That item is not waiting for manual completion.',
  refund_reference_required: 'Enter a reference for the completed external refund.',
  invalid_withdrawal_decision: 'Choose approve or hold.',
  withdrawal_not_found: 'That withdrawal no longer exists.',
  withdrawal_not_reviewable: 'That withdrawal is no longer waiting for review.',
  refund_budget_allocation_failed: 'Refusing to exceed the remaining ad budget assigned to this payment.',
  brand_not_active: 'Only active brands can be changed here. Pending listings must be handled in the review queue.',
  setting_not_editable: 'That setting cannot be changed here.',
  setting_not_found: 'That setting is missing from the database.',
  setting_value_invalid: 'That value is invalid or outside the allowed range.',
};
export function adminErrorNotice(message: string): string {
  return ADMIN_ERRORS[message] ?? 'Something went wrong. Nothing was changed.';
}
