import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { getBoard, getCategoryTabs, type BoardKind, type BoardRow } from '@/lib/leaderboard';
import { formatUSDCompact } from '@brandbid/shared';

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

const rankColor = (rank: number) => (rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-muted');

export default async function Home({ searchParams }: { searchParams: Promise<{ board?: string; category?: string }> }) {
  const sp = await searchParams;
  const board: BoardKind = sp.board === 'today' ? 'today' : 'all';

  const categories = await getCategoryTabs();
  const category = categories.find((c) => c.slug === sp.category) ?? null;
  const rows = await getBoard(board, category?.id ?? null);
  // "Take this spot" prices are global all-time ranks, so they only make sense on the unfiltered all-time board.
  const canTake = board === 'all' && !category;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />

      <section className="pb-6 pt-2">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Pay to rank. Get shared.</h1>
        <p className="mt-2 max-w-xl text-muted">
          Brands pay for a spot on the board. Half of every payment becomes ad budget that pays people to send visitors.
        </p>
      </section>

      <nav aria-label="Board" className="flex gap-1 border-b border-line">
        {([['all', 'All-time'], ['today', 'Today']] as const).map(([k, label]) => (
          <Link
            key={k}
            href={href(k, category?.slug)}
            aria-current={board === k ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${board === k ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {categories.length > 0 && (
        <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3">
          <Link href={href(board)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${!category ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted'}`}>
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={href(board, c.slug)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${category?.id === c.id ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted'}`}
            >
              {c.name} <span className="opacity-60">{c.liveBrands}</span>
            </Link>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <Empty board={board} />
      ) : (
        <ol className="mt-2 divide-y divide-line rounded-card border border-line bg-surface">
          {rows.map((r) => (
            <Row key={r.brandId} row={r} board={board} canTake={canTake} />
          ))}
        </ol>
      )}
    </main>
  );
}

function Row({ row, board, canTake }: { row: BoardRow; board: BoardKind; canTake: boolean }) {
  const amount = board === 'today' ? row.todayCents! : row.totalPaidCents;
  return (
    <li className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <span className={`num w-7 shrink-0 text-right text-lg font-extrabold sm:w-9 sm:text-xl ${rankColor(row.rank)}`}>{row.rank}</span>
      <BrandLogo name={row.name} logoPath={row.logoPath} />
      <div className="min-w-0 flex-1">
        <Link href={`/b/${row.slug}`} className="block truncate font-semibold hover:underline">{row.name}</Link>
        {row.description && <p className="truncate text-sm text-muted">{row.description}</p>}
      </div>
      <div className="shrink-0 text-right">
        <div className="num font-bold">{formatUSDCompact(amount)}</div>
        <div className="text-xs text-muted">{board === 'today' ? 'today' : 'paid'}</div>
        {canTake && row.takePriceCents !== null && (
          <Link href={`/list?rank=${row.rank}`} className="mt-1 hidden text-xs font-semibold underline sm:inline-block">
            Take #{row.rank} for {formatUSDCompact(row.takePriceCents)}
          </Link>
        )}
      </div>
    </li>
  );
}

function Empty({ board }: { board: BoardKind }) {
  return (
    <div className="mt-4 rounded-card border border-dashed border-line p-10 text-center">
      <p className="font-semibold">{board === 'today' ? 'No bids yet today.' : 'No brands here yet.'}</p>
      <p className="mt-1 text-sm text-muted">Be the first one on the board.</p>
      <Link href="/list" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">List your brand</Link>
    </div>
  );
}
