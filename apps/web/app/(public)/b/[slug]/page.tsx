import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteFooter } from '@/components/SiteFooter';
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

  const host = new URL(brand.url).hostname.replace(/^www\./, '');
  const visitHref = viaHandle && clickId ? `/out/${clickId}` : `/out/b/${brand.slug}`;

  return (
    <>
    <main className="mx-auto max-w-[1280px] px-5 sm:px-10">
      <SiteHeader />

      <PromoQualification clickId={viaHandle ? clickId : null} linkCode={promoLinkCode} needsConsent={consentRequired} initialConsent={initialConsent} viaHandle={viaHandle} />

      <nav aria-label="Breadcrumb" className="pt-5 text-[13px] font-medium text-muted">
        <Link href="/" className="text-muted hover:text-fg">Boards</Link>
        {brand.category && <> / <Link href={`/?category=${brand.category.slug}`} className="text-muted hover:text-fg">{brand.category.name}</Link></>}
        {' / '}<span className="text-fg">{brand.name}</span>
      </nav>

      <div className="grid gap-10 pb-12 pt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <BrandLogo name={brand.name} logoPath={brand.logoPath} size={120} />
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-center gap-2">
                {brand.category && <span className="rounded-full border border-line bg-surface px-3 py-[5px] text-[13px] font-medium">{brand.category.name}</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ddf1e3] py-1 pl-2 pr-2.5 text-xs font-semibold text-[#145c33]"><span className="h-1.5 w-1.5 rounded-full bg-positive" />Live</span>
              </div>
              <h1 className="break-words text-[44px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[64px] lg:text-[76px]">{brand.name}</h1>
              {brand.description && <p className="max-w-[600px] text-pretty text-[17px] leading-[1.45] text-muted sm:text-[19px]">{brand.description}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <a href={visitHref} target="_blank" rel="noopener nofollow sponsored" className="rounded-full bg-accent px-[22px] py-[13px] text-[15px] font-semibold text-accent-fg hover:text-accent-fg">Visit {host} ↗</a>
                {showAdvertise && <Link href={`/advertise/${brand.slug}`} className="rounded-full bg-brand px-[22px] py-[13px] text-[15px] font-semibold text-ink hover:text-ink">Advertise this brand</Link>}
              </div>
            </div>
          </div>

          {topPromoters.length > 0 && <section aria-labelledby="top-promoters">
            <h2 id="top-promoters" className="pb-1.5 font-display text-[22px] font-bold">Top promoters</h2>
            <p className="mb-3 text-sm text-muted">Promoters ranked by settled earnings from this brand.</p>
            <ol className="rounded-2xl border border-line bg-surface">
              {topPromoters.map((promoter) => <li key={promoter.rank} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <span className="num font-mono text-sm font-semibold text-muted">#{promoter.rank}</span>
                <span className="truncate font-semibold">{promoter.anonymous ? 'Anonymous' : `@${promoter.handle ?? 'anonymous'}`}</span>
                <span className="text-right"><strong className="num block font-mono">{formatUSDCompact(promoter.earnedCents)}</strong><small className="text-muted">{promoter.qualifiedVisitors.toLocaleString()} visitors</small></span>
              </li>)}
            </ol>
          </section>}

          {brand.related.length > 0 && (
            <section aria-labelledby="more" className="flex flex-col gap-1">
              <h2 id="more" className="pb-1.5 font-display text-[22px] font-bold">{brand.category ? `More in ${brand.category.name}` : 'More on the board'}</h2>
              <ul>
                {brand.related.map((r) => (
                  <li key={r.brandId}>
                    <Link href={`/b/${r.slug}`} className="flex items-center gap-3.5 border-t border-line py-3 text-fg hover:text-fg">
                      <span className="num w-8 shrink-0 font-mono text-[15px] font-semibold">#{r.rank}</span>
                      <BrandLogo name={r.name} logoPath={r.logoPath} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-bold">{r.name}</span>
                        {r.description && <span className="block truncate text-sm text-muted">{r.description}</span>}
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold underline">View</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-[18px] rounded-[18px] bg-ink p-6 text-ink-fg">
            <div className="flex items-center gap-4">
              <span className={`num flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl font-mono text-[34px] font-bold ${brand.allTimeRank === 1 ? 'bg-brand text-ink' : 'bg-ink-line text-ink-fg'}`}>{brand.allTimeRank ?? '–'}</span>
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-[22px] font-bold">{brand.allTimeRank ? `#${brand.allTimeRank} all-time` : 'Not ranked yet'}</span>
                <span className="text-[13px] text-ink-muted">{brand.todayRank ? `#${brand.todayRank} today` : 'no bids today'}{brand.todayCents > 0 ? ` · ${formatUSDCompact(brand.todayCents)}` : ''}</span>
              </div>
            </div>
            <dl className="flex flex-col gap-3 border-t border-ink-line pt-3.5 text-sm text-ink-muted">
              <div className="flex justify-between"><dt>Total paid</dt><dd className="num font-mono text-[15px] font-semibold text-ink-fg">{formatUSDCompact(brand.totalPaidCents)}</dd></div>
              <div className="flex justify-between"><dt>Listed</dt><dd className="text-ink-fg">{listed(brand.listedAt)}</dd></div>
            </dl>
            <span className="text-[13px] font-medium text-ink-muted">Own this brand? <Link href="/dash" className="text-ink-fg underline hover:text-ink-fg">Manage in dashboard</Link></span>
          </div>

          {showAdvertise && <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[22px]">
            <div className="font-mono text-[11px] uppercase text-muted">For promoters</div>
            <p className="text-pretty text-sm leading-normal text-muted">Someone new to {brand.name} opens your link and stays on the page for 10 seconds. The brand pays you for each qualified visitor, settled after every 24-hour cycle.</p>
            <Link href={`/advertise/${brand.slug}`} className="rounded-full bg-brand p-[13px] text-center text-[15px] font-semibold text-ink hover:text-ink">Get my link</Link>
          </div>}
        </aside>
      </div>

      <p className="pb-4 text-center text-sm text-muted">
        Want a spot on the board? <Link href="/list" className="underline">List your brand</Link>
      </p>
    </main>
    <SiteFooter />
    </>
  );
}
