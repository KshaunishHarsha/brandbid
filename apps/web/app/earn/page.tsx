import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = { title: 'Earn by sharing brands' };

export default function Earn() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <SiteHeader />
      <section className="max-w-xl space-y-5 py-10">
        <h1 className="text-3xl font-extrabold">Earn by sharing brands you like</h1>
        <p>Choose a brand on the leaderboard, create a unique link, and share it with a clear ad label. A qualified visitor is a real person new to that brand who stays active on its page for 10 seconds.</p>
        <p>Brands pay for those qualified visitors from their ad budgets. Earnings settle in 24-hour cycles. The promoter beta is invite-only while we test the traffic flow.</p>
        <Link href="/" className="inline-block rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg">Find a brand to share</Link>
      </section>
    </main>
  );
}
