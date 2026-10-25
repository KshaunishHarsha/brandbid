import { formatUSD } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Fraud review · Admin' };

type Row = Record<string, unknown>;
function record(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null;
}
function string(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

export default async function FraudQueue({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin('/admin/fraud');
  const { notice } = await searchParams;
  const { data, error } = await createAdminClient().rpc('admin_fraud_queue', { p_admin_id: admin.id });
  const flags = Array.isArray(data) ? data.map(record).filter((item): item is Row => item !== null) : [];

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Fraud review</h1>
      <p className="mt-1 text-sm text-muted">Review flagged earnings. Clear every open rule on an earning to release it; confirming any rule reverses the earning.</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger p-3 text-sm text-danger">The fraud queue could not be loaded.</p>}
      {!error && flags.length === 0 ? (
        <p className="mt-8 rounded-card border border-dashed border-line p-10 text-center text-muted">No open fraud flags.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {flags.map((flag) => {
            const earning = record(flag.earning);
            const details = record(flag.details);
            const flagId = string(flag.flag_id);
            const amount = number(earning?.amount_cents);
            return (
              <li key={flagId} className="rounded-card border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">{string(flag.rule)} · score {number(flag.score) ?? '—'}</h2>
                    <p className="mt-1 text-sm text-muted">Subject: {string(flag.subject_type)} {string(flag.subject_id)}</p>
                    <p className="mt-1 text-xs text-muted">Flagged {string(flag.created_at)}</p>
                  </div>
                  {amount !== null && <span className="num text-lg font-bold">{formatUSD(amount)}</span>}
                </div>
                {details && <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs">{JSON.stringify(details, null, 2)}</pre>}
                {earning ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div><dt className="inline text-muted">Promoter: </dt><dd className="inline">{string(earning.promoter_email, string(earning.promoter_id))}</dd></div>
                    <div><dt className="inline text-muted">Brand: </dt><dd className="inline">{string(earning.brand_name, string(earning.brand_id))}</dd></div>
                    <div><dt className="inline text-muted">Link: </dt><dd className="inline">{string(earning.link_code)} · {string(earning.channel)}</dd></div>
                    <div><dt className="inline text-muted">Earning: </dt><dd className="inline">{string(earning.status)} · {string(earning.id)}</dd></div>
                    <div><dt className="inline text-muted">Visitor: </dt><dd className="inline">{string(earning.visitor_id)} · {string(earning.country, 'Unknown')} · {number(earning.active_ms) ?? '—'} ms</dd></div>
                    <div><dt className="inline text-muted">Click-through: </dt><dd className="inline">{string(earning.outbound_at, 'none')}</dd></div>
                  </dl>
                ) : <p className="mt-3 text-sm text-muted">Related earning context is unavailable for this subject.</p>}

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <form method="post" action={`/api/admin/fraud/${flagId}/review`} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="decision" value="clear" />
                    <label className="text-sm">Note (optional)<input name="reason" maxLength={500} className="mt-1 block rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
                    <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Clear flag</button>
                  </form>
                  <form method="post" action={`/api/admin/fraud/${flagId}/review`} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="decision" value="confirm" />
                    <label className="text-sm">Reason<input name="reason" required minLength={3} maxLength={500} className="mt-1 block rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
                    <button className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white">Confirm and reverse</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
