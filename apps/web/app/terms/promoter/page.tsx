import Link from 'next/link';

export const metadata = { title: 'Promoter terms' };

export default function PromoterTerms() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/earn" className="text-sm underline">← Promoter program</Link>
      <h1 className="text-2xl font-bold">Promoter terms</h1>
      <p>When you share a brandbid promotion link, label the post clearly as an ad using <strong>#ad</strong> or the platform&apos;s paid partnership label.</p>
      <p>Only real people clicking count. Bots, click farms, paid clicks, click exchange groups, and clicking your own link void earnings and may lead to a ban.</p>
      <p>You may not promote a brand you own or work for. Earnings later found to be fraudulent can be deducted from future earnings, including after a withdrawal.</p>
      <p>brandbid makes the final decision on traffic quality and whether an earning qualifies.</p>
    </main>
  );
}
