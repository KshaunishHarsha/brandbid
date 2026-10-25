import { redirect, notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { getUser } from '@/lib/auth';
import { BRAND_INVITE_TOKEN_RE } from '@/lib/brand-invites';

export const metadata = { title: 'Accept brand invite', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function BrandInvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { token } = await params;
  if (!BRAND_INVITE_TOKEN_RE.test(token)) notFound();
  const user = await getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/brands/invite/${token}`)}`);
  const { notice } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 pb-20">
      <SiteHeader />
      <section className="mt-8 rounded-card border border-line bg-surface p-5">
        <h1 className="text-xl font-bold">Accept a brand team invitation</h1>
        <p className="mt-2 text-sm text-muted">Signed in as {user.email ?? 'an account without an email'}. The invitation only works for the email address it was sent to.</p>
        {notice && <p role="status" className="mt-4 text-sm text-danger">{notice}</p>}
        <form method="post" action={`/api/brands/invite/${token}`} className="mt-5">
          <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg">Accept invitation</button>
        </form>
      </section>
    </main>
  );
}
