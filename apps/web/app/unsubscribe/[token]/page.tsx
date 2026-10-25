import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Email preferences' };
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const validFormat = /^[0-9a-f]{64}$/.test(token);
  const tokenHash = validFormat ? createHash('sha256').update(token).digest('hex') : '';
  const { data } = validFormat
    ? await createAdminClient().rpc('email_unsubscribe_status', { p_token_hash: tokenHash })
    : { data: false };
  const valid = data === true;
  return <main className="mx-auto max-w-xl px-4 py-14">
    <h1 className="text-2xl font-bold">Email preferences</h1>
    {done === '1' ? <p role="status" className="mt-4 text-sm">You are unsubscribed from optional product alerts. Important account and payment emails are unaffected.</p>
      : valid ? <>
        <p className="mt-3 text-sm text-muted">Confirm that you want to stop optional product alerts, such as brand outbid and low-budget notices. Important account and payment emails will continue.</p>
        <form method="post" action={`/api/email-preferences/unsubscribe/${token}`} className="mt-5">
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Confirm unsubscribe</button>
        </form>
      </> : <p className="mt-4 text-sm">This unsubscribe link is invalid, expired, or already used. You can manage preferences after signing in.</p>}
  </main>;
}
