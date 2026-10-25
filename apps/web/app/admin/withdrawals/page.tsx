import { formatUSD } from '@brandbid/shared';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Withdrawals · Admin' };
type Withdrawal = { id: string; promoter_id: string; handle: string | null; amount_cents: number; fee_cents: number | null; provider: string; status: string; external_ref: string | null; created_at: string; trust_score: number | null; kyc_status: string | null; reviewed_at: string | null; review_note: string | null };
function isWithdrawal(value: unknown): value is Withdrawal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.promoter_id === 'string' && typeof v.amount_cents === 'number'
    && typeof v.provider === 'string' && typeof v.status === 'string' && typeof v.created_at === 'string';
}

export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin('/admin/withdrawals');
  const { notice } = await searchParams;
  const { data, error } = await createAdminClient().rpc('admin_withdrawal_queue', { p_admin_id: admin.id, p_limit: 200 });
  const items = Array.isArray(data) ? data.filter(isWithdrawal) : [];
  return <main className="pt-6">
    <h1 className="text-2xl font-bold">Withdrawal review</h1>
    <p className="mt-1 text-sm text-muted">Approval moves a request to processing for a separately configured payout workflow. This screen does not send money. Hold requests that need more checks and record a reason.</p>
    {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-danger">Could not load the withdrawal review queue.</p>}
    {!error && items.length === 0 && <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm">No withdrawals need review.</p>}
    <ul className="mt-5 space-y-3">{items.map((item) => <li key={item.id} className="rounded-card border border-line bg-surface p-4">
      <h2 className="font-bold">{item.handle ? `@${item.handle}` : item.promoter_id} · {formatUSD(item.amount_cents)}</h2>
      <p className="mt-1 text-sm text-muted">{item.status} · {item.provider} · requested {new Date(item.created_at).toLocaleString('en-US', { timeZone: 'UTC' })} UTC · trust {item.trust_score ?? 'unknown'} · KYC {item.kyc_status ?? 'unknown'}</p>
      {item.fee_cents != null && <p className="text-sm text-muted">Fee {formatUSD(item.fee_cents)} · external ref {item.external_ref ?? 'none'}</p>}
      {item.review_note && <p className="mt-2 text-sm">Review note: {item.review_note}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form method="post" action={`/api/admin/withdrawals/${encodeURIComponent(item.id)}/review`}>
          <input type="hidden" name="decision" value="approve" />
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Approve for processing</button>
        </form>
        <form method="post" action={`/api/admin/withdrawals/${encodeURIComponent(item.id)}/review`} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="decision" value="hold" />
          <label className="text-sm">Reason for hold<input name="reason" required minLength={3} maxLength={500} className="mt-1 block w-72 max-w-full rounded-lg border border-line bg-bg px-3 py-2" /></label>
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Hold for review</button>
        </form>
      </div>
    </li>)}</ul>
  </main>;
}
