import Link from 'next/link';
import { formatUSD } from '@brandbid/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Brands · Admin' };
type Row = Record<string, unknown>;
const record = (v: unknown): Row | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : null;
const string = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;

export default async function AdminBrands({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  const admin = await requireAdmin('/admin/brands');
  const { q = '', notice } = await searchParams;
  const query = q.trim().slice(0, 120);
  const result = query.length >= 2
    ? await createAdminClient().rpc('admin_search_brands', { p_admin_id: admin.id, p_query: query })
    : { data: [], error: null };
  const brands = Array.isArray(result.data) ? result.data.map(record).filter((b): b is Row => b !== null) : [];

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Brands</h1>
      <p className="mt-1 text-sm text-muted">Search by name, slug, URL, or brand ID. Removal is a soft removal; ledger and budget history are preserved.</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      <form method="get" className="mt-5 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="brand-q">Search brands</label>
        <input id="brand-q" name="q" minLength={2} maxLength={120} defaultValue={query} placeholder="Name, slug, URL, or ID" className="w-80 max-w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
        <button className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold">Search</button>
      </form>
      {result.error && <p role="alert" className="mt-4 text-sm text-danger">Brand search failed.</p>}
      {!result.error && query.length >= 2 && brands.length === 0 && <p className="mt-6 text-sm text-muted">No matching brands.</p>}
      {query.length < 2 && <p className="mt-6 text-sm text-muted">Enter at least two characters to search.</p>}
      <ul className="mt-5 space-y-3">
        {brands.map((brand) => {
          const brandId = string(brand.id);
          const ledger = Array.isArray(brand.recent_budget_ledger) ? brand.recent_budget_ledger.map(record).filter((entry): entry is Row => entry !== null) : [];
          return (
            <li key={brandId} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-bold"><Link href={`/b/${encodeURIComponent(string(brand.slug))}`} className="hover:underline">{string(brand.name, brandId)}</Link></h2>
                  <p className="text-sm text-muted">{string(brand.slug)} · {string(brand.status)} · {brand.ads_enabled ? 'ads on' : 'ads off'}</p>
                  <p className="mt-1 text-sm">Owner: {string(brand.owner_email, string(brand.owner_id))} · {number(brand.bid_count) ?? 0} bids · {number(brand.link_count) ?? 0} links</p>
                  <p className="num text-sm">Paid {formatUSD(number(brand.total_paid_cents) ?? 0)} · Budget cache {formatUSD(number(brand.budget_cents) ?? 0)} · Ledger {formatUSD(number(brand.ledger_balance_cents) ?? 0)}</p>
                </div>
                <div className="text-right text-xs text-muted"><p>Rate {formatUSD(number(brand.rate_cents) ?? 0)}</p><p>Created {string(brand.created_at)}</p></div>
              </div>
              {ledger.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium">Recent budget ledger entries ({ledger.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {ledger.map((entry, i) => <li key={i} className="flex justify-between gap-3"><span>{string(entry.reason)}</span><span className="num">{formatUSD(number(entry.delta_cents) ?? 0)}</span></li>)}
                  </ul>
                </details>
              )}
              {brand.status === 'active' && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {brand.ads_enabled === true && <BrandActionForm brandId={brandId} query={query} action="disable_ads" label="Disable ads" />}
                  <BrandActionForm brandId={brandId} query={query} action="remove" label="Remove brand" danger />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function BrandActionForm({ brandId, query, action, label, danger = false }: { brandId: string; query: string; action: 'disable_ads' | 'remove'; label: string; danger?: boolean }) {
  return (
    <form method="post" action={`/api/admin/brands/${brandId}/action`} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="q" value={query} />
      <label className="text-xs">Reason<input name="reason" required minLength={3} maxLength={500} className="mt-1 block rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
      <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${danger ? 'bg-danger text-white' : 'border border-line'}`}>{label}</button>
    </form>
  );
}
