import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getAdminOverview } from '@/lib/admin';

export const metadata = { title: 'Admin' };

export default async function AdminHome() {
  await requireAdmin('/admin');
  const o = await getAdminOverview();
  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card href="/admin/listings" label="Listings waiting for review" value={o.pendingListings} hot={o.pendingListings > 0} />
        <Card label="Refunds in progress" value={o.refundsOwed} hint="Payments being returned to rejected brands" />
        <Card label="Refunds that need a person" value={o.refundsStuck} hot={o.refundsStuck > 0} hint="Failed 10 times: refund by hand in the payment dashboard" />
      </div>

      <h2 className="mb-2 mt-10 text-lg font-bold">Recent activity</h2>
      {o.recent.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface text-sm">
          {o.recent.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
              <span><span className="font-semibold">{a.action.replaceAll('_', ' ')}</span> <span className="text-muted">{summarize(a.details)}</span></span>
              <time className="text-xs text-muted" dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function summarize(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const d = details as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d.reason === 'string') bits.push(`"${d.reason}"`);
  if (typeof d.refund_cents === 'number') bits.push(`refund $${(d.refund_cents / 100).toFixed(2)}`);
  if (typeof d.error === 'string') bits.push(d.error);
  return bits.join(' · ');
}

function Card({ label, value, hint, hot, href }: { label: string; value: number; hint?: string; hot?: boolean; href?: string }) {
  const body = (
    <div className={`rounded-card border p-4 ${hot ? 'border-danger' : 'border-line'} bg-surface`}>
      <div className={`num text-3xl font-extrabold ${hot ? 'text-danger' : ''}`}>{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
