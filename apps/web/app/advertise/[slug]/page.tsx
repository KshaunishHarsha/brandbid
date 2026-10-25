import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser, signInUrl } from '@/lib/auth';
import { canAdvertise } from '@/lib/beta';
import { getBrandPage } from '@/lib/brand';
import { createClient } from '@/lib/supabase/server';
import { JoinWaitlist } from './JoinWaitlist';

export const dynamic = 'force-dynamic';

export default async function Advertise({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandPage(slug);
  if (!brand) notFound();
  const next = `/advertise/${brand.slug}`;
  const user = await getUser();
  if (!user) redirect(signInUrl(next));
  if (!user.email_confirmed_at) return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">Confirm your email first</h1><p className="mt-3">Open the sign-in link we sent you, then return to this brand.</p></main>;
  if (!(await canAdvertise(user.email))) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <Link href={`/b/${brand.slug}`} className="text-sm underline">← {brand.name}</Link>
        <h1 className="text-2xl font-bold">Join the promoter beta</h1>
        <p>Invitations are limited right now. Join the waitlist and we&apos;ll let you know when you can share brands.</p>
        <JoinWaitlist />
      </main>
    );
  }
  const db = await createClient();
  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from('profiles').select('handle, promoter_terms_accepted_at').eq('id', user.id).single(),
    db.from('brand_members').select('role').eq('brand_id', brand.id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (membership) {
    return <main className="mx-auto max-w-md space-y-4 p-6"><Link href={`/b/${brand.slug}`} className="text-sm underline">← {brand.name}</Link><h1 className="text-2xl font-bold">You can&apos;t promote this brand</h1><p>You&apos;re part of its team.</p></main>;
  }
  if (!profile?.handle || !profile.promoter_terms_accepted_at) redirect(`/onboarding/promoter?next=${encodeURIComponent(next)}`);
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <Link href={`/b/${brand.slug}`} className="text-sm underline">← {brand.name}</Link>
      <h1 className="text-2xl font-bold">Share {brand.name}</h1>
      <p>Choose where you want to share. Your own link for each channel is coming in the next step of the beta.</p>
      <div className="grid grid-cols-2 gap-2">
        {['Instagram story', 'LinkedIn', 'X', 'Copy link'].map((channel) => <button key={channel} disabled className="rounded-lg border border-line bg-surface p-3 text-left opacity-60">{channel}</button>)}
      </div>
    </main>
  );
}
