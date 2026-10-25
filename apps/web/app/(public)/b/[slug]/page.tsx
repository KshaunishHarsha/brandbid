import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { getBrandPage } from '@/lib/brand';
import { getUser } from '@/lib/auth';
import { canAdvertise } from '@/lib/beta';
import { logoPublicUrl } from '@/lib/logos';
import { cookies, headers } from 'next/headers';
import { CONSENT_COOKIE, needsConsent, isValidCode } from '@brandbid/shared';
import { PromoQualification } from './PromoQualification';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTopPromotersForBrand } from '@/lib/top-promoters';

// Fresh on every request (page caching comes with the R2 cache, P1.12).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ c?: string; l?: string }> };

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

export default async function BrandPageRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  const brand = await getBrandPage(slug);
  if (!brand) notFound();
  const topPromoters = await getTopPromotersForBrand(brand.id);
  const user = await getUser();
  const showAdvertise = !user || await canAdvertise(user.email);
  const query = await searchParams;
  const clickId = query?.c && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.c) ? query.c : null;
  const linkCode = query?.l && isValidCode(query.l) ? query.l : null;
  let viaHandle: string | null = null;
  let promoLinkCode: string | null = null;
  if (clickId && linkCode) {
    const admin = createAdminClient();
    const { data: link } = await admin.from('links').select('brand_id,promoter_id').eq('code', linkCode).eq('status', 'active').maybeSingle();
    if (link?.brand_id === brand.id) {
      const { data: profile } = await admin.from('public_profiles').select('handle').eq('id', link.promoter_id).maybeSingle();
      if (profile?.handle) { viaHandle = profile.handle; promoLinkCode = linkCode; }
    }
  }
  const requestHeaders = await headers();
  const country = requestHeaders.get('cf-ipcountry');
  const consentRequired = needsConsent(country);
  const consentCookie = (await cookies()).get(CONSENT_COOKIE)?.value;
  const initialConsent = consentCookie === 'yes' || consentCookie === 'no' ? consentCookie : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />

      <PromoQualification clickId={viaHandle ? clickId : null} linkCode={promoLinkCode} needsConsent={consentRequired} initialConsent={initialConsent} viaHandle={viaHandle} />

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
          href={viaHandle && clickId ? `/out/${clickId}` : `/out/b/${brand.slug}`}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="mt-6 block rounded-xl bg-accent px-6 py-4 text-center text-lg font-bold text-accent-fg"
        >
          Visit {brand.name} →
        </a>
        <p className="mt-2 text-center text-xs text-muted">Opens {new URL(brand.url).hostname.replace(/^www\./, '')} in a new tab</p>
        {showAdvertise && <Link href={`/advertise/${brand.slug}`} className="mt-4 block text-center text-sm font-semibold underline">Advertise this brand</Link>}
      </article>

      {topPromoters.length > 0 && <section className="mt-10" aria-labelledby="top-promoters">
        <h2 id="top-promoters" className="mb-3 text-lg font-bold">Top promoters</h2>
        <p className="mb-3 text-sm text-muted">Promoters ranked by settled earnings from this brand.</p>
        <ol className="divide-y divide-line rounded-card border border-line bg-surface">
          {topPromoters.map((promoter) => <li key={promoter.rank} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3">
            <span className="num text-sm font-bold text-muted">#{promoter.rank}</span>
            <span className="truncate font-semibold">{promoter.anonymous ? 'Anonymous' : `@${promoter.handle ?? 'anonymous'}`}</span>
            <span className="text-right"><strong className="num block">{formatUSDCompact(promoter.earnedCents)}</strong><small className="text-muted">{promoter.qualifiedVisitors.toLocaleString()} visitors</small></span>
          </li>)}
        </ol>
      </section>}

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
