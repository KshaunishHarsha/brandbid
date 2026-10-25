import Link from 'next/link';
import { formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { listMyBrands } from '@/lib/dashboard';

export const metadata = { title: 'Your brands' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: 'Live', tone: 'bg-positive/15 text-positive' },
  pending_review: { label: 'Under review', tone: 'bg-gold/15 text-gold' },
  rejected: { label: 'Not listed', tone: 'bg-danger/15 text-danger' },
  removed: { label: 'Removed', tone: 'bg-danger/15 text-danger' },
};

export default async function Dashboard() {
  await requireUser('/dash');
  const brands = await listMyBrands();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Your brands</h1>
        <Link href="/dash/promoter" className="text-sm underline">Promoter dashboard</Link>
      </div>
      {brands.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line p-10 text-center">
          <p className="font-semibold">You haven&apos;t listed a brand yet.</p>
          <Link href="/list" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">List your brand</Link>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {brands.map((b) => {
            const s = STATUS[b.status] ?? { label: b.status, tone: 'bg-line text-muted' };
            return (
              <li key={b.slug}>
                <Link href={`/dash/brands/${b.slug}`} className="flex items-center gap-3 p-4 hover:bg-bg">
                  <BrandLogo name={b.name} logoPath={b.logoPath} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.name}</span>
                    <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
                  </span>
                  <span className="num text-right text-sm font-semibold">{b.totalPaidCents > 0 ? formatUSDCompact(b.totalPaidCents) : ''}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted"><Link href="/list" className="underline">List another brand</Link></p>
    </main>
  );
}
