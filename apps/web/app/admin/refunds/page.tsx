import { formatUSD } from '@brandbid/shared';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Budget refunds · Admin' };
type ManualRefund = { item_id: string; refund_id: string; brand_name: string; brand_slug: string; payment_id: string; amount_cents: number; attempts: number; last_error: string | null; requested_at: string };
const isManualRefund = (value: unknown): value is ManualRefund => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.item_id === 'string' && typeof v.refund_id === 'string' && typeof v.brand_name === 'string'
    && typeof v.brand_slug === 'string' && typeof v.payment_id === 'string' && typeof v.amount_cents === 'number'
    && typeof v.attempts === 'number';
};

export default async function BudgetRefundsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin('/admin/refunds');
  const { notice } = await searchParams;
  const { data, error } = await createAdminClient().rpc('admin_budget_refunds', { p_admin_id: admin.id, p_limit: 100 });
  const items = Array.isArray(data) ? data.filter(isManualRefund) : [];
  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Budget refunds needing manual handling</h1>
      <p className="mt-1 text-sm text-muted">Complete a refund in the configured payment provider first, then enter its reference here. This screen only records a verified manual refund; it never sends money.</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-danger">Could not load the manual refund queue.</p>}
      {!error && items.length === 0 && <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm">No budget refunds need manual handling.</p>}
      <ul className="mt-5 space-y-3">
        {items.map((item) => <li key={item.item_id} className="rounded-card border border-line bg-surface p-4">
          <h2 className="font-bold">{item.brand_name} · {formatUSD(item.amount_cents)}</h2>
          <p className="mt-1 text-sm text-muted">Payment {item.payment_id} · request {item.refund_id} · {item.attempts} processor attempts</p>
          {item.last_error && <p className="mt-1 text-sm text-danger">{item.last_error}</p>}
          <form method="post" action={`/api/admin/budget-refunds/${encodeURIComponent(item.item_id)}`} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">Completed refund reference<input name="reference" required minLength={3} maxLength={200} className="mt-1 block w-72 max-w-full rounded-lg border border-line bg-bg px-3 py-2" /></label>
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Record completed refund</button>
          </form>
        </li>)}
      </ul>
    </main>
  );
}
