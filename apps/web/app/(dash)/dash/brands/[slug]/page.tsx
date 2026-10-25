import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUSD, formatUSDCompact } from '@brandbid/shared';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { getDashboardData, getMemberBrand } from '@/lib/dashboard';
import { recordMemberSignal } from '@/lib/member-signals';
import { PaidWatcher } from './PaidWatcher';
import { RerankPanel } from './RerankPanel';
import { RateSetting } from './RateSetting';

export const metadata = { title: 'Brand dashboard' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ notice?: string; paid?: string }> };

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';

export default async function BrandDashboard({ params, searchParams }: Props) {
  const { slug } = await params;
  const { notice, paid } = await searchParams;
  await requireUser(`/dash/brands/${slug}`);
  const member = await getMemberBrand(slug);
  if (!member) notFound(); // not a member, or no such brand: the same answer
  await recordMemberSignal(member.brand.id, member.user.id);
  const { brand } = member;
  const d = await getDashboardData(member);
  const live = brand.status === 'active';

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20">
      <SiteHeader />
      <Link href="/dash" className="text-sm text-muted">← Your brands</Link>

      <div className="mt-3 flex items-center gap-4">
        <BrandLogo name={brand.name} logoPath={brand.logoPath} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{brand.name}</h1>
          <div className="flex flex-wrap gap-x-3">
            {live ? <Link href={`/b/${brand.slug}`} className="text-sm underline">View public page</Link> : <span className="text-sm text-muted">{brand.categoryName}</span>}
            {live && <Link href={`/dash/brands/${encodeURIComponent(brand.slug)}/traffic`} className="text-sm underline">Traffic stats</Link>}
          </div>
        </div>
      </div>

      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      {paid && <div className="mt-4"><PaidWatcher slug={brand.slug} totalPaidCents={brand.totalPaidCents} /></div>}

      {brand.status === 'pending_review' && (
        <p className="mt-4 rounded-lg border border-gold/60 bg-gold/10 p-4 text-sm">
          <strong>Under review.</strong> Your payment was received and we are checking your listing. You will get an email when it goes live. Some categories are reviewed by hand and can take longer.
        </p>
      )}
      {brand.status === 'rejected' && (
        <p className="mt-4 rounded-lg border border-danger/60 bg-danger/10 p-4 text-sm">
          <strong>We could not list this brand.</strong>{brand.reviewReason ? ` Reason: ${brand.reviewReason}.` : ''} Your payment was refunded in full; it can take 5 to 10 business days to reach your bank.{' '}
          <Link href="/list" className="underline">List again</Link>
        </p>
      )}
      {brand.status === 'removed' && <p className="mt-4 rounded-lg border border-danger/60 bg-danger/10 p-4 text-sm"><strong>This listing was removed.</strong> Contact support if you think this is a mistake.</p>}

      {live && (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="All-time rank" value={d.allTimeRank ? `#${d.allTimeRank}` : '–'} />
            <Stat label="Today" value={d.todayRank ? `#${d.todayRank}` : '–'} sub={d.todayCents > 0 ? `${formatUSDCompact(d.todayCents)} today` : 'no bids today'} />
            <Stat label="Total paid" value={formatUSDCompact(brand.totalPaidCents)} />
            <Stat label="Ads" value={brand.adsEnabled ? 'Running' : 'Paused'} sub={brand.adsEnabled ? undefined : d.budget.owedCount > 0 ? `${d.budget.owedCount} visitors waiting` : 'budget below rate'} />
          </dl>

          <section className="mt-8 rounded-card border border-line bg-surface p-5" aria-labelledby="move">
            <h2 id="move" className="text-lg font-bold">{d.allTimeRank === 1 ? "You're #1" : 'Move up the board'}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              {d.moveUpPriceCents !== null
                ? `To take #${(d.allTimeRank ?? 2) - 1} you need to pay ${formatUSD(d.moveUpPriceCents)} more.`
                : 'Keep the lead, and keep your ad budget topped up.'}
            </p>
            <RerankPanel slug={brand.slug} brandName={brand.name} minBidCents={d.minBidCents} ladder={d.ladder} suggestedCents={d.moveUpPriceCents ?? d.minBidCents} owedCents={d.budget.owed} />
          </section>
        </>
      )}

      <section className="mt-8" aria-labelledby="budget">
        <h2 id="budget" className="mb-3 text-lg font-bold">Ad budget</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Remaining" value={formatUSD(d.budget.remaining)} />
          <Stat label="Added in total" value={formatUSD(d.budget.added)} />
          <Stat label="Spent on visitors" value={formatUSD(d.budget.spent)} />
          <Stat label="Pays about" value={`${d.budget.visitorsLeft}`} sub={`more visitors at ${formatUSD(brand.rateCents)} each`} />
        </div>
        {d.budget.refunded > 0 && <p className="mt-2 text-sm text-muted">Refunded to you: {formatUSD(d.budget.refunded)}</p>}
        {d.budget.owedCount > 0 && (
          <p className="mt-3 rounded-lg border border-gold/60 bg-gold/10 p-3 text-sm">
            {d.budget.owedCount} qualified visitor{d.budget.owedCount === 1 ? ' is' : 's are'} waiting to be paid ({formatUSD(d.budget.owed)}). Your next payment covers them first.
          </p>
        )}
      {live && brand.role === 'owner' && <section className="mt-8 rounded-card border border-line bg-surface p-5" aria-labelledby="refund-budget">
        <h2 id="refund-budget" className="text-lg font-bold">Refund unspent ad budget</h2>
        {d.refund && ['requested', 'processing', 'manual'].includes(d.refund.status) ? (
          <p className="mt-2 text-sm">Refund request for {formatUSD(d.refund.amountCents)} · <strong>{d.refund.status === 'manual' ? 'needs manual review' : d.refund.status === 'requested' ? 'awaiting processor setup' : 'in progress'}</strong>. Revenue share is never included.</p>
        ) : d.refundEligibility?.eligible ? (
          <>
            <p className="mt-1 text-sm text-muted">No visitor was funded for 30 days and no visitors are waiting. Only the remaining ad budget is included; rank and brandbid&apos;s revenue share stay unchanged. Payment age and the configured processor window may require manual handling.</p>
            <form method="post" action={`/api/brands/${encodeURIComponent(brand.slug)}/refund`} className="mt-3">
              <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Request {formatUSD(d.refundEligibility.amountCents)} refund</button>
            </form>
          </>
        ) : <p className="mt-1 text-sm text-muted">{d.refundEligibility?.reason === 'budget_not_stagnant' ? 'Refunds are available after 30 days without a funded visitor.' : d.refundEligibility?.reason === 'waitlist_owed' ? 'Pay the waiting visitors from a future top-up before requesting a refund.' : 'There is no refundable ad budget right now.'}</p>}
      </section>}
        {(brand.status === 'active' || brand.status === 'pending_review') && (
          <RateSetting slug={brand.slug} rateCents={brand.rateCents} floorCents={d.floorCents} remainingCents={d.budget.remaining} />
        )}
      </section>

      {live && <section className="mt-8 rounded-card border border-line bg-surface p-5" aria-labelledby="report-traffic">
        <h2 id="report-traffic" className="text-lg font-bold">Report suspicious traffic</h2>
        <p className="mt-1 text-sm text-muted">Send a note to the brandbid review team. Reports are private to admins and will not be visible to promoters.</p>
        <form method="post" action={`/api/brands/${encodeURIComponent(brand.slug)}/report-traffic`} className="mt-3 space-y-2">
          <label className="block text-sm">What looks suspicious?<textarea name="reason" required minLength={10} maxLength={1000} rows={3} className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2" /></label>
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Send report</button>
        </form>
      </section>}

      {live && brand.role === 'owner' && <section className="mt-8 rounded-card border border-line bg-surface p-5" aria-labelledby="team-invite">
        <h2 id="team-invite" className="text-lg font-bold">Invite a teammate</h2>
        <p className="mt-1 text-sm text-muted">They will receive a sign-in link and must accept with the invited email. Invitations expire after 7 days. Team members can view and edit the listing but cannot pay or invite others.</p>
        <form method="post" action={`/api/brands/${encodeURIComponent(brand.slug)}/invite`} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">Email<input name="email" type="email" required maxLength={320} className="mt-1 block w-72 max-w-full rounded-lg border border-line bg-bg px-3 py-2" /></label>
          <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Send invitation</button>
        </form>
      </section>}

      <section className="mt-8" aria-labelledby="bids">
        <h2 id="bids" className="mb-3 text-lg font-bold">Payments</h2>
        {d.bids.length === 0 ? (
          <p className="text-sm text-muted">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Date</th><th className="p-3">Paid</th><th className="p-3">Ad budget</th><th className="p-3">brandbid</th><th className="p-3">Reference</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.bids.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap p-3">{when(b.createdAt)}</td>
                    <td className="num p-3 font-semibold">{formatUSD(b.amountCents)}{b.status === 'refunded' && <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">refunded</span>}</td>
                    <td className="num p-3">{formatUSD(b.budgetCents)}</td>
                    <td className="num p-3">{formatUSD(b.revenueCents)}</td>
                    <td className="p-3 font-mono text-xs text-muted">{b.paymentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Half of each payment becomes your ad budget; half is brandbid&apos;s. Razorpay emails a receipt for every payment.</p>
      </section>

      {(brand.status === 'active' || brand.status === 'pending_review') && (
        <section className="mt-8" aria-labelledby="edit">
          <h2 id="edit" className="mb-3 text-lg font-bold">Edit your listing</h2>
          <form method="post" action={`/api/brands/${brand.slug}/edit`} encType="multipart/form-data" className="space-y-3 rounded-card border border-line bg-surface p-5">
            <div>
              <label htmlFor="description" className="block text-sm font-medium">One-line description</label>
              <textarea id="description" name="description" defaultValue={brand.description ?? ''} minLength={10} maxLength={160} rows={2} required className="w-full rounded-lg border border-line bg-bg px-3 py-3" />
            </div>
            <div>
              <label htmlFor="logo" className="block text-sm font-medium">New logo <span className="font-normal text-muted">(PNG, JPEG or WebP, under 1 MB; leave empty to keep the current one)</span></label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm" />
            </div>
            <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg">Save changes</button>
          </form>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-xl font-extrabold">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}
