import Link from 'next/link';
import { formatUSD } from '@brandbid/shared';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getPromoterLeaderboard, type PromoterBoardPeriod } from '@/lib/promoter-leaderboard';

export const metadata = { title: 'Promoter leaderboard' };
export const dynamic = 'force-dynamic';

export default async function PromoterLeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: rawPeriod } = await searchParams;
  const period: PromoterBoardPeriod = rawPeriod === 'week' ? 'week' : 'all_time';
  const rows = await getPromoterLeaderboard(period);
  return (
    <>
    <main className="mx-auto max-w-[1280px] px-5 sm:px-10">
      <SiteHeader />
      <section className="pb-6 pt-10">
        <h1 className="text-[44px] font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-[64px]">Promoter leaderboard</h1>
        <p className="mt-3 max-w-xl text-pretty text-base text-muted">Ranked by settled earnings. Promoters who hide their profile appear as anonymous.</p>
      </section>
      <nav aria-label="Promoter board period" className="flex gap-1 border-b border-line">
        {([['week', 'This week'], ['all_time', 'All time']] as const).map(([value, label]) => (
          <Link key={value} href={`/promoters?period=${value}`} aria-current={period === value ? 'page' : undefined}
            className={`-mb-px border-b-[3px] px-4 py-3 text-[15px] font-semibold ${period === value ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
            {label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">No settled promoter earnings yet.</p> : (
        <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map((row) => <li key={`${row.rank}-${row.handle}`} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3">
            <span className="num font-mono text-sm font-semibold text-muted">#{row.rank}</span>
            <span className="truncate font-semibold">{row.handle === 'anonymous' ? 'Anonymous' : `@${row.handle}`}</span>
            <span className="text-right"><strong className="num block font-mono">{formatUSD(row.earnedCents)}</strong><small className="text-muted">{row.qualifiedVisitors.toLocaleString()} visitors</small></span>
          </li>)}
        </ol>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
