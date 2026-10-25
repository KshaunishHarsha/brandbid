import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { getBrandPage } from '@/lib/brand';
import { logoPublicUrl } from '@/lib/logos';

// Fresh on every request (page caching comes with the R2 cache, P1.12).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandPage(slug);
  if (!brand) return { title: 'Brand not found', robots: { index: false } };

  const title = `${brand.name} on brandbid`;
  const description = brand.description ?? `${brand.name} is on the brandbid leaderboard.`;
  const logo = logoPublicUrl(brand.logoPath);
  return {
    title: brand.name,
    description,
    alternates: { canonical: `/b/${brand.slug}` },
    openGraph: { type: 'website', title, description, url: `/b/${brand.slug}`, siteName: 'brandbid', images: logo ? [{ url: logo }] : undefined },
    twitter: { card: 'summary', title, description, images: logo ? [logo] : undefined },
  };
}

const listed = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const rankColor = (rank: number) => (rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-fg');

export default async function BrandPageRoute({ params }: Props) {
  const { slug } = await params;
  const brand = await getBrandPage(slug);
  if (!brand) notFound();

  // Phase 2 adds the "You're here via @handle" banner and the 10-second qualification script here (BUILD section 13, step B).

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />

      <article className="rounded-card border border-line bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <BrandLogo name={brand.name} logoPath={brand.logoPath} size={72} />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{brand.name}</h1>
            {brand.category && (
              <Link href={`/?category=${brand.category.slug}`} className="mt-1 inline-block text-sm text-muted hover:underline">
                {brand.category.name}
              </Link>
            )}
          </div>
        </div>

        {brand.description && <p className="mt-4 text-lg">{brand.description}</p>}

        <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat label="All-time rank" value={brand.allTimeRank ? `#${brand.allTimeRank}` : '–'} valueClass={brand.allTimeRank ? rankColor(brand.allTimeRank) : ''} />
          <Stat label="Today" value={brand.todayRank ? `#${brand.todayRank}` : '–'} sub={brand.todayCents > 0 ? `${formatUSDCompact(brand.todayCents)} today` : 'no bids today'} valueClass={brand.todayRank ? rankColor(brand.todayRank) : ''} />
          <Stat label="Total paid" value={formatUSDCompact(brand.totalPaidCents)} sub={`since ${listed(brand.listedAt)}`} />
        </dl>

        <a
          href={`/out/b/${brand.slug}`}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="mt-6 block rounded-xl bg-accent px-6 py-4 text-center text-lg font-bold text-accent-fg"
        >
          Visit {brand.name} →
        </a>
        <p className="mt-2 text-center text-xs text-muted">Opens {new URL(brand.url).hostname.replace(/^www\./, '')} in a new tab</p>
      </article>

      {brand.related.length > 0 && (
        <section className="mt-10" aria-labelledby="more">
          <h2 id="more" className="mb-3 text-lg font-bold">{brand.category ? `More in ${brand.category.name}` : 'More on the board'}</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {brand.related.map((r) => (
              <li key={r.brandId}>
                <Link href={`/b/${r.slug}`} className="flex items-center gap-3 p-3 hover:bg-bg sm:p-4">
                  <BrandLogo name={r.name} logoPath={r.logoPath} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    {r.description && <span className="block truncate text-sm text-muted">{r.description}</span>}
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">{formatUSDCompact(r.totalPaidCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-center text-sm text-muted">
        Want a spot on the board? <Link href="/list" className="underline">List your brand</Link>
      </p>
    </main>
  );
}

function Stat({ label, value, sub, valueClass = '' }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num mt-1 text-xl font-extrabold ${valueClass}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}
