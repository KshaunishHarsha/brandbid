import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { Countdown } from '@/components/Countdown';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getBoard, getCategoryTabs, type BoardKind, type BoardRow } from '@/lib/leaderboard';
import { formatUSDCompact } from '@brandbid/shared';
import { getUser } from '@/lib/auth';
import { canAdvertise } from '@/lib/beta';

// Fresh on every request. Page caching comes with the R2 incremental cache in P1.12: on Cloudflare without
// it a revalidating page would be frozen at its build-time contents.
export const dynamic = 'force-dynamic';

function href(board: BoardKind, category?: string) {
  const p = new URLSearchParams();
  if (board === 'today') p.set('board', 'today');
  if (category) p.set('category', category);
  const q = p.toString();
  return q ? `/?${q}` : '/';
}

export default async function Home({ searchParams }: { searchParams: Promise<{ board?: string; category?: string }> }) {
  const sp = await searchParams;
  const board: BoardKind = sp.board === 'today' ? 'today' : 'all';

  const categories = await getCategoryTabs();
  const category = categories.find((c) => c.slug === sp.category) ?? null;
  const rows = await getBoard(board, category?.id ?? null);
  // "Take this spot" prices are global all-time ranks, so they only make sense on the unfiltered all-time board.
  const canTake = board === 'all' && !category;
  const user = await getUser();
  const showAdvertise = !user || await canAdvertise(user.email);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <>
    <main className="mx-auto max-w-[1280px] px-5 sm:px-10">
      <SiteHeader />

      <section className="grid items-end gap-8 pb-6 pt-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 lg:pb-8 lg:pt-12">
        <div className="flex flex-col gap-3.5">
          <h1 className="text-[56px] font-extrabold leading-[0.88] tracking-[-0.045em] sm:text-[88px] lg:text-[104px]">The board.</h1>
          <p className="max-w-[560px] text-pretty text-base leading-[1.45] text-muted sm:text-[19px]">
            Brands pay to rank. The higher the bid, the higher the spot. Half of every bid funds promoters who send them visitors.
          </p>
        </div>
        <div className="flex flex-col gap-3.5 rounded-2xl bg-ink p-[22px] text-ink-fg">
          <div className="flex items-baseline justify-between font-mono text-xs uppercase text-ink-muted">
            <span>Today&apos;s board resets in</span><span className="text-[11px]">00:00 UTC</span>
          </div>
          <Countdown className="font-mono text-[44px] font-semibold tracking-[-0.03em]" />
          <Link href="/list" className="rounded-full bg-brand p-3 text-center text-sm font-semibold text-ink hover:text-ink">List your brand · from $10</Link>
          {showAdvertise && <p className="text-[13px] text-ink-muted">Or <Link href="/discover" className="text-ink-fg underline hover:text-ink-fg">earn as a promoter</Link>: share any brand below.</p>}
        </div>
      </section>

      <div className="flex items-center gap-6 border-b border-line">
        <nav aria-label="Board" className="flex gap-1 text-[15px] font-semibold">
          {([['today', 'Today'], ['all', 'All-time']] as const).map(([k, label]) => (
            <Link
              key={k}
              href={href(k, category?.slug)}
              aria-current={board === k ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-3 py-3.5 hover:text-fg ${board === k ? 'border-brand text-fg' : 'border-transparent text-muted'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <span className="hidden text-[13px] text-muted sm:inline">{rows.length} brand{rows.length === 1 ? '' : 's'} · sorted by {board === 'today' ? 'today’s bids' : 'total paid'}</span>
      </div>

      {categories.length > 0 && (
        <nav aria-label="Categories" className="-mx-5 flex gap-2 overflow-x-auto px-5 py-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <Pill href={href(board)} active={!category}>All</Pill>
          {categories.map((c) => (
            <Pill key={c.id} href={href(board, c.slug)} active={category?.id === c.id}>{c.name}</Pill>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <Empty board={board} category={category?.name ?? null} />
      ) : (
        <div>
          <div className="hidden grid-cols-[64px_52px_minmax(0,1fr)_130px_160px_110px_220px] items-center gap-4 border-b border-fg py-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted lg:grid">
            <span>Rank</span><span /><span>Brand</span><span>Category</span>
            <span className="text-right">{canTake ? 'To take rank' : ''}</span>
            <span className="text-right">{board === 'today' ? 'Today' : 'Paid'}</span><span />
          </div>
          <ol>
            {rows.map((r) => (
              <Row key={r.brandId} row={r} board={board} canTake={canTake} showAdvertise={showAdvertise} category={r.categoryId ? categoryName.get(r.categoryId) ?? '' : ''} />
            ))}
          </ol>
        </div>
      )}
    </main>
    <SiteFooter />
    </>
  );
}

function Pill({ href: to, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} className={`shrink-0 rounded-full border px-3.5 py-[7px] text-[13px] font-medium ${active ? 'border-accent bg-accent text-accent-fg hover:text-accent-fg' : 'border-line bg-surface'}`}>
      {children}
    </Link>
  );
}

const rankChip = (rank: number) =>
  rank === 1 ? 'bg-brand text-ink' : rank <= 3 ? 'bg-ink text-ink-fg' : 'bg-transparent text-fg';

function Row({ row, board, canTake, showAdvertise, category }: { row: BoardRow; board: BoardKind; canTake: boolean; showAdvertise: boolean; category: string }) {
  const amount = board === 'today' ? row.todayCents! : row.totalPaidCents;
  return (
    <li className="grid grid-cols-[44px_48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 border-b border-line py-3.5 lg:grid-cols-[64px_52px_minmax(0,1fr)_130px_160px_110px_220px] lg:gap-4">
      <span className={`num flex h-9 w-9 items-center justify-center rounded-lg border-[1.5px] border-fg font-mono text-[15px] font-bold lg:h-11 lg:w-11 lg:rounded-[10px] lg:text-[19px] ${rankChip(row.rank)}`}>{row.rank}</span>
      <BrandLogo name={row.name} logoPath={row.logoPath} size={48} />
      <div className="min-w-0">
        <Link href={`/b/${row.slug}`} className="block truncate font-display text-base font-bold text-fg hover:text-brand lg:text-lg">{row.name}</Link>
        {row.description && <p className="truncate text-[13px] text-muted lg:text-sm">{row.description}</p>}
      </div>
      <span className="hidden text-[13px] font-medium text-muted lg:block">{category}</span>
      <span className="num hidden text-right font-mono text-[17px] font-semibold tracking-[-0.02em] lg:block">
        {canTake && row.takePriceCents !== null ? (
          <Link href={`/list?rank=${row.rank}`} className="text-fg hover:text-brand" title={`Take #${row.rank}`}>{formatUSDCompact(row.takePriceCents)}</Link>
        ) : ''}
      </span>
      <span className="num hidden text-right font-mono text-sm text-muted lg:block">{formatUSDCompact(amount)}<span className="text-[11px]"> {board === 'today' ? 'today' : 'paid'}</span></span>
      <div className="col-span-3 flex items-center gap-2 lg:col-span-1 lg:justify-end">
        <span className="num mr-auto font-mono text-sm font-semibold lg:hidden">
          {formatUSDCompact(amount)}
          <span className="block font-sans text-[11px] font-normal text-muted">
            {board === 'today' ? 'today' : 'paid'}{canTake && row.takePriceCents !== null ? ` · take #${row.rank} for ${formatUSDCompact(row.takePriceCents)}` : ''}
          </span>
        </span>
        <a href={`/out/b/${row.slug}`} target="_blank" rel="noopener nofollow sponsored" className="rounded-full border-[1.5px] border-fg px-3.5 py-2 text-[13px] font-semibold">Visit ↗</a>
        {showAdvertise && <Link href={`/advertise/${row.slug}`} className="rounded-full bg-brand px-4 py-[9.5px] text-[13px] font-semibold text-ink hover:text-ink">Advertise</Link>}
      </div>
    </li>
  );
}

function Empty({ board, category }: { board: BoardKind; category: string | null }) {
  return (
    <div className="mt-2 flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-[#bdb8aa] px-5 py-7">
      <span className="flex h-11 w-11 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-fg font-mono text-[19px] font-bold">1</span>
      <p className="font-display text-[28px] font-extrabold leading-none tracking-[-0.02em]">
        {category ? `No ${category} brands yet.` : board === 'today' ? 'No bids yet today.' : 'No brands here yet.'}
      </p>
      <p className="text-pretty text-sm leading-[1.45] text-muted">{category ? `The #1 spot in ${category} is open.` : 'The #1 spot is open.'} Take it for the $10 minimum bid.</p>
      <Link href="/list" className="rounded-full bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-fg hover:text-accent-fg">{category ? `List a ${category} brand` : 'List your brand'}</Link>
      {category && <Link href="/" className="text-[13px] font-semibold underline">See all categories</Link>}
    </div>
  );
}
