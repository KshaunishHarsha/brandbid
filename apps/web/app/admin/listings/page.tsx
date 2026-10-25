import { formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { explainReason, getAllCategories, getPendingListings } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Listings to review · Admin' };

const REASON_PRESETS = ['Looks like a scam', 'Not a real product or service', 'Prohibited category (adult, gambling, weapons, illegal)', 'Misleading name or description', 'Website does not work'];

export default async function Listings({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireAdmin('/admin/listings');
  const { notice } = await searchParams;
  const [listings, categories] = await Promise.all([getPendingListings(), getAllCategories()]);

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Listings to review</h1>
      <p className="mt-1 text-sm text-muted">Paid listings that did not go live automatically. Rejecting refunds the full payment.</p>

      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}

      {listings.length === 0 ? (
        <p className="mt-8 rounded-card border border-dashed border-line p-10 text-center text-muted">Nothing waiting. 🎉</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {listings.map((l) => {
            const host = (() => { try { return new URL(l.url).hostname; } catch { return l.url; } })();
            const reasons = l.reviewReason ? l.reviewReason.split(',') : [];
            return (
              <li key={l.brandId} className="rounded-card border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <BrandLogo name={l.name} logoPath={l.logoPath} size={56} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{l.name}</h2>
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm underline">{host} ↗</a>
                    {l.description && <p className="mt-1 text-sm">{l.description}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num font-bold">{formatUSDCompact(l.totalPaidCents)}</div>
                    <div className="text-xs text-muted">{l.bidCount} payment{l.bidCount === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-muted">Owner: </dt><dd className="inline">{l.ownerEmail ?? 'unknown'}</dd></div>
                  <div><dt className="inline text-muted">Submitted: </dt><dd className="inline">{new Date(l.createdAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</dd></div>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!l.checked && <span className="rounded bg-line px-2 py-1 text-xs">Automatic check not run yet</span>}
                  {reasons.map((r) => (
                    <span key={r} className="rounded bg-danger/10 px-2 py-1 text-xs font-medium text-danger">{explainReason(r)}</span>
                  ))}
                </div>

                <form method="post" action={`/api/admin/listings/${l.brandId}/category`} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <label htmlFor={`cat-${l.brandId}`} className="text-muted">Category</label>
                  <select id={`cat-${l.brandId}`} name="categoryId" defaultValue={l.categoryId ?? ''} className="rounded-lg border border-line bg-bg px-2 py-1">
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}{c.requires_review ? ' (review)' : ''}</option>))}
                  </select>
                  <button className="rounded-lg border border-line px-3 py-1 font-medium">Change</button>
                </form>

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <form method="post" action={`/api/admin/listings/${l.brandId}/approve`}>
                    <button className="rounded-lg bg-positive px-4 py-2 font-semibold text-white">Approve and go live</button>
                  </form>

                  <details className="rounded-lg border border-line">
                    <summary className="cursor-pointer select-none px-4 py-2 font-semibold text-danger">Reject and refund</summary>
                    <form method="post" action={`/api/admin/listings/${l.brandId}/reject`} className="space-y-2 border-t border-line p-3">
                      <label htmlFor={`why-${l.brandId}`} className="block text-sm font-medium">Reason (the owner sees this)</label>
                      <input id={`why-${l.brandId}`} name="reason" list={`presets-${l.brandId}`} required minLength={3} maxLength={500} className="w-72 max-w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
                      <datalist id={`presets-${l.brandId}`}>{REASON_PRESETS.map((p) => (<option key={p} value={p} />))}</datalist>
                      <p className="text-xs text-muted">Refunds {formatUSDCompact(l.totalPaidCents)} in full and emails the owner.</p>
                      <button className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white">Reject and refund {formatUSDCompact(l.totalPaidCents)}</button>
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
