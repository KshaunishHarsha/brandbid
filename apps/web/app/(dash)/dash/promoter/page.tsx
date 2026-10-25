import Link from 'next/link';
import { formatUSD } from '@brandbid/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { getPromoterDashboard, type PromoterLinkStats } from '@/lib/promoter-dashboard';
import { CycleCountdown } from './CycleCountdown';

export const metadata = { title: 'Promoter dashboard' };
export const dynamic = 'force-dynamic';

const CHANNELS: Record<string, string> = { story: 'Instagram story', linkedin: 'LinkedIn', x: 'X', link: 'Direct link' };

function qualificationRate(link: PromoterLinkStats) {
  if (link.clicks === 0) return '—';
  return `${((link.qualifiedVisitors / link.clicks) * 100).toFixed(1)}%`;
}

function expiryDate(value: string) {
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default async function PromoterDashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser('/dash/promoter');
  const data = await getPromoterDashboard(user.id);
  const { notice } = await searchParams;
  const nowAt = new Date().toISOString();
  const brands = new Map<string, PromoterLinkStats[]>();
  for (const link of data.links) brands.set(link.brandId, [...(brands.get(link.brandId) ?? []), link]);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <SiteHeader />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Promoter dashboard</h1>
          <p className="mt-1 text-sm text-muted">See how your links are performing and when pending earnings settle.</p>
        </div>
        <Link href="/dash" className="text-sm underline">Brand dashboard</Link>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Earnings summary">
        <Balance label="Available balance" cents={data.totals.balanceCents} />
        <Balance label="Pending" cents={data.totals.pendingCents} />
        <Balance label="Waitlisted" cents={data.totals.waitlistedCents} />
      </section>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      <section className="mt-4 rounded-card border border-line bg-surface p-4" aria-label="Withdrawals">
        <h2 className="font-semibold">Withdraw available earnings</h2>
        <p className="mt-1 text-sm text-muted">Minimum {formatUSD(data.totals.minWithdrawalCents)}. The first request is reviewed by an admin. Payout delivery becomes available after phone, KYC and payout-provider setup.</p>
        {data.totals.withdrawalOpen ? <p className="mt-3 text-sm">You already have a withdrawal request awaiting review or processing.</p> : canWithdraw(data.totals) ? (
          <form method="post" action="/api/promoter/withdrawals" className="mt-3">
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">Request {formatUSD(data.totals.balanceCents)}</button>
          </form>
        ) : <p className="mt-3 text-sm text-muted">{withdrawalRequirement(data.totals)}</p>}
        {data.withdrawals.length > 0 && <ul className="mt-4 divide-y divide-line border-t border-line">
          {data.withdrawals.map((item) => <li key={item.id} className="py-3 text-sm">
            <span className="font-medium">{formatUSD(item.amountCents)} · {item.status}</span>
            <span className="ml-2 text-muted">{item.provider} · {expiryDate(item.createdAt)}</span>
            {item.feeCents != null && <span className="ml-2 text-muted">Fee {formatUSD(item.feeCents)}</span>}
          </li>)}
        </ul>}
      </section>

      <section className="mt-8" aria-labelledby="links-title">
        <h2 id="links-title" className="text-lg font-bold">Link performance</h2>
        {brands.size === 0 ? (
          <div className="mt-3 rounded-card border border-dashed border-line p-8 text-center">
            <p className="font-semibold">No promoter links yet.</p>
            <p className="mt-1 text-sm text-muted">Choose a live brand and create a link to start tracking visits.</p>
            <Link href="/" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">Explore brands</Link>
          </div>
        ) : (
          <div className="mt-3 space-y-5">
            {[...brands.entries()].map(([brandId, links]) => {
              const first = links[0]!;
              return (
                <article key={brandId} className="rounded-card border border-line bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{first.brandName}</h3>
                    <span className={`rounded px-2 py-1 text-xs font-medium ${first.brandStatus === 'active' && first.adsEnabled ? 'bg-positive/15 text-positive' : 'bg-gold/15 text-gold'}`}>
                      {first.brandStatus === 'active' && first.adsEnabled ? 'Active' : first.brandStatus === 'active' ? 'Budget used up — new visitors are waitlisted' : first.brandStatus === 'pending_review' ? 'Under review' : 'Not active'}
                    </span>
                  </div>
                  <ul className="mt-3 divide-y divide-line">
                    {links.map((link) => (
                      <li key={link.linkId} className="py-4 first:pt-1 last:pb-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{CHANNELS[link.channel] ?? link.channel}</p>
                            <p className="mt-1 text-xs text-muted">Link status: {link.linkStatus}</p>
                          </div>
                          <Link href={`/advertise/${encodeURIComponent(link.brandSlug)}`} className="text-sm underline">Open share tools</Link>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <Metric label="Clicks" value={link.clicks.toLocaleString()} />
                          <Metric label="Qualified visitors" value={link.qualifiedVisitors.toLocaleString()} />
                          <Metric label="Qualification rate" value={qualificationRate(link)} />
                          <Metric label="Pending earnings" value={formatUSD(link.pendingCents)} />
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                          <span>Current cycle ends in <strong className="text-fg"><CycleCountdown endsAt={link.currentCycleEndsAt} nowAt={nowAt} /></strong></span>
                          {link.nextSettlementAt && <span>Next pending settlement: {expiryDate(link.nextSettlementAt)} <span title={link.nextSettlementAt}>· <CycleCountdown endsAt={link.nextSettlementAt} nowAt={nowAt} /></span></span>}
                        </div>
                        {link.waitlistedEarnings.length > 0 && (
                          <div className="mt-3 rounded-lg bg-bg p-3 text-sm">
                            <p className="font-medium">Waitlisted · {formatUSD(link.waitlistedCents)}</p>
                            <ul className="mt-1 space-y-1 text-xs text-muted">
                              {link.waitlistedEarnings.map((earning, index) => (
                                <li key={`${earning.createdAt}-${index}`}>{formatUSD(earning.amountCents)} · paid when {first.brandName} refills · expires {expiryDate(earning.expiresAt)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Balance({ label, cents }: { label: string; cents: number }) {
  return <div className="rounded-card border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="num mt-1 text-xl font-bold">{formatUSD(cents)}</p></div>;
}

type Wallet = { balanceCents: number; minWithdrawalCents: number; phoneVerified: boolean; kycStatus: string; payoutAccountVerified: boolean; withdrawalOpen: boolean; accountActive: boolean };
function canWithdraw(wallet: Wallet) {
  return wallet.accountActive && !wallet.withdrawalOpen && wallet.balanceCents >= wallet.minWithdrawalCents && wallet.phoneVerified && wallet.kycStatus === 'verified' && wallet.payoutAccountVerified;
}
function withdrawalRequirement(wallet: Wallet) {
  if (!wallet.accountActive) return 'An active promoter account is required to request a withdrawal.';
  if (wallet.balanceCents < wallet.minWithdrawalCents) return `Your settled balance must reach ${formatUSD(wallet.minWithdrawalCents)} before you can request a withdrawal.`;
  if (!wallet.phoneVerified || wallet.kycStatus !== 'verified' || !wallet.payoutAccountVerified) return 'Complete phone verification, KYC and payout-account setup to request a withdrawal.';
  return 'No balance is currently available to withdraw.';
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="num mt-1 font-semibold">{value}</dd></div>;
}
