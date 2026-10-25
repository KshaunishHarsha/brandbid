import { formatUSD } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Users · Admin' };
type Row = Record<string, unknown>;
const record = (v: unknown): Row | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : null;
const string = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  const admin = await requireAdmin('/admin/users');
  const { q = '', notice } = await searchParams;
  const query = q.trim().slice(0, 120);
  const result = query.length >= 2
    ? await createAdminClient().rpc('admin_search_users', { p_admin_id: admin.id, p_query: query })
    : { data: [], error: null };
  const users = Array.isArray(result.data) ? result.data.map(record).filter((u): u is Row => u !== null) : [];

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="mt-1 text-sm text-muted">Search by email, handle, or account ID. Ledger balances are net amounts in cents.</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      <form method="get" className="mt-5 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="user-q">Search users</label>
        <input id="user-q" name="q" minLength={2} maxLength={120} defaultValue={query} placeholder="Email, handle, or ID" className="w-80 max-w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
        <button className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold">Search</button>
      </form>
      {result.error && <p role="alert" className="mt-4 text-sm text-danger">User search failed.</p>}
      {!result.error && query.length >= 2 && users.length === 0 && <p className="mt-6 text-sm text-muted">No matching accounts.</p>}
      {query.length < 2 && <p className="mt-6 text-sm text-muted">Enter at least two characters to search.</p>}
      <ul className="mt-5 space-y-3">
        {users.map((user) => {
          const userId = string(user.id);
          const ledger = Array.isArray(user.recent_ledger) ? user.recent_ledger.map(record).filter((entry): entry is Row => entry !== null) : [];
          return (
            <li key={userId} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-bold">{string(user.email, userId)}</h2>
                  <p className="text-sm text-muted">@{string(user.handle, 'no handle')} · {string(user.country, 'country unknown')} · {string(user.status)}{user.is_admin ? ' · admin' : ''}</p>
                  <p className="mt-1 text-sm">Trust {number(user.trust_score) ?? '—'} · KYC {string(user.kyc_status, 'unknown')} · {number(user.link_count) ?? 0} links</p>
                  <p className="num text-sm font-semibold">Ledger balance: {formatUSD(number(user.ledger_balance_cents) ?? 0)}</p>
                </div>
                <p className="text-xs text-muted">Joined {string(user.created_at)}</p>
              </div>
              {ledger.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium">Recent ledger entries ({ledger.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {ledger.map((entry, i) => <li key={i} className="flex justify-between gap-3"><span>{string(entry.reason)} · {string(entry.note)}</span><span className="num">{formatUSD(number(entry.delta_cents) ?? 0)}</span></li>)}
                  </ul>
                </details>
              )}
              {!user.is_admin && user.status !== 'banned' && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {user.status !== 'suspended' && <ActionForm userId={userId} action="suspend" label="Suspend" />}
                  <ActionForm userId={userId} action="ban" label="Ban and forfeit positive balance" danger />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function ActionForm({ userId, action, label, danger = false }: { userId: string; action: 'suspend' | 'ban'; label: string; danger?: boolean }) {
  return (
    <form method="post" action={`/api/admin/users/${userId}/action`} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="action" value={action} />
      <label className="text-xs">Reason<input name="reason" required minLength={3} maxLength={500} className="mt-1 block rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
      <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${danger ? 'bg-danger text-white' : 'border border-line'}`}>{label}</button>
    </form>
  );
}
