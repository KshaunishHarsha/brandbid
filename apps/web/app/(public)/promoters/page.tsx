import Link from 'next/link';
import { formatUSD } from '@brandbid/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { getPromoterLeaderboard, type PromoterBoardPeriod } from '@/lib/promoter-leaderboard';

export const metadata = { title: 'Promoter leaderboard' };
export const dynamic = 'force-dynamic';

export default async function PromoterLeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: rawPeriod } = await searchParams;
  const period: PromoterBoardPeriod = rawPeriod === 'week' ? 'week' : 'all_time';
  const rows = await getPromoterLeaderboard(period);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />
      <section className="pb-5 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Promoter leaderboard</h1>
        <p className="mt-2 text-sm text-muted">Ranked by settled earnings. Promoters who hide their profile appear as anonymous.</p>
      </section>
      <nav aria-label="Promoter board period" className="flex gap-1 border-b border-line">
        {([['week', 'This week'], ['all_time', 'All time']] as const).map(([value, label]) => (
          <Link key={value} href={`/promoters?period=${value}`} aria-current={period === value ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${period === value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
            {label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">No settled promoter earnings yet.</p> : (
        <ol className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {rows.map((row) => <li key={`${row.rank}-${row.handle}`} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3">
            <span className="num text-sm font-bold text-muted">#{row.rank}</span>
            <span className="truncate font-semibold">{row.handle === 'anonymous' ? 'Anonymous' : `@${row.handle}`}</span>
            <span className="text-right"><strong className="num block">{formatUSD(row.earnedCents)}</strong><small className="text-muted">{row.qualifiedVisitors.toLocaleString()} visitors</small></span>
          </li>)}
        </ol>
      )}
    </main>
  );
}
