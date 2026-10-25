import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUSD } from '@brandbid/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { getBrandTrafficStats } from '@/lib/brand-traffic';
import { getDashboardData, getMemberBrand } from '@/lib/dashboard';
import { TrafficCharts } from './TrafficCharts';

export const metadata = { title: 'Brand traffic' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export default async function BrandTraffic({ params }: Props) {
  const { slug } = await params;
  await requireUser(`/dash/brands/${slug}/traffic`);
  const member = await getMemberBrand(slug);
  if (!member) notFound();
  const [dashboard, traffic] = await Promise.all([getDashboardData(member), getBrandTrafficStats(member.brand.id)]);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <SiteHeader />
      <Link href={`/dash/brands/${encodeURIComponent(member.brand.slug)}`} className="text-sm text-muted">← {member.brand.name}</Link>
      <h1 className="mt-2 text-2xl font-bold">Traffic</h1>
      <p className="mt-1 text-sm text-muted">Daily traffic and audience breakdown for the last 30 days (UTC).</p>

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Budget spent" value={formatUSD(dashboard.budget.spent)} />
        <Stat label="Budget remaining" value={formatUSD(dashboard.budget.remaining)} />
        <Stat label="Estimated visitors left" value={dashboard.budget.visitorsLeft.toLocaleString()} />
      </dl>

      <TrafficCharts daily={traffic.daily} channels={traffic.channels} countries={traffic.countries} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-line bg-surface p-4"><dt className="text-xs text-muted">{label}</dt><dd className="num mt-1 text-xl font-bold">{value}</dd></div>;
}
