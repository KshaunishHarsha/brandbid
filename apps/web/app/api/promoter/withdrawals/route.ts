import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

const NOTICES: Record<string, string> = {
  promoter_not_active: 'An active promoter account is required to request a withdrawal.',
  phone_verification_required: 'Verify your phone number before requesting a withdrawal.',
  kyc_not_verified: 'Complete KYC verification before requesting a withdrawal.',
  payout_account_required: 'Set up and verify a payout account before requesting a withdrawal.',
  withdrawal_open: 'You already have a withdrawal request awaiting review or processing.',
  withdrawal_balance_negative: 'Your balance needs review before a withdrawal can be requested.',
  withdrawal_below_minimum: 'Your settled balance is below the withdrawal minimum.',
};

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const target = new URL('/dash/promoter', req.url);
  const user = await getUser();
  if (!user) {
    target.pathname = '/signin';
    target.searchParams.set('next', '/dash/promoter');
    return NextResponse.redirect(target, 303);
  }
  const { data, error } = await createAdminClient().rpc('request_withdrawal', { p_promoter_id: user.id });
  if (error) target.searchParams.set('notice', NOTICES[error.message] ?? 'The withdrawal request could not be created. Nothing was changed.');
  else {
    const result = data && typeof data === 'object' ? data as { status?: unknown; amount_cents?: unknown } : {};
    const amount = Number(result.amount_cents);
    target.searchParams.set('notice', Number.isSafeInteger(amount) && amount > 0
      ? `Withdrawal request for ${(amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} recorded for ${result.status === 'review' ? 'admin review' : 'processing'}. Payout delivery requires the configured provider.`
      : 'Withdrawal request recorded. Payout delivery requires the configured provider.');
  }
  return NextResponse.redirect(target, 303);
}
