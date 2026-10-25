import Link from 'next/link';
import { formatUSD } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { getDiscoverBrands } from '@/lib/discover-brands';

export const metadata = { title: 'Discover brands to promote' };
export const dynamic = 'force-dynamic';

export default async function DiscoverBrandsPage() {
  const brands = await getDiscoverBrands();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />
      <section className="pb-5 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Discover brands</h1>
        <p className="mt-2 text-sm text-muted">Promote active campaigns with enough budget for at least one new visitor. Higher visitor rates and larger budgets appear first.</p>
      </section>
      {brands.length === 0 ? <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">No funded campaigns are available right now.</p> : (
        <ul className="space-y-3">{brands.map((brand) => <li key={brand.id} className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <BrandLogo name={brand.name} logoPath={brand.logoPath} size={48} />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold"><Link href={`/b/${encodeURIComponent(brand.slug)}`} className="hover:underline">{brand.name}</Link></h2>
              {brand.description && <p className="mt-1 text-sm text-muted">{brand.description}</p>}
              <p className="mt-2 text-sm">{formatUSD(brand.rateCents)} per qualified visitor · about {brand.visitorsLeft.toLocaleString()} visitors left</p>
            </div>
            <Link href={`/advertise/${encodeURIComponent(brand.slug)}`} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg">Share</Link>
          </div>
        </li>)}</ul>
      )}
    </main>
  );
}
