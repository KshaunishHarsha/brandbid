import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser, signInUrl } from '@/lib/auth';
import { COUNTRY_OPTIONS, isCountryCode } from '@/lib/countries';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';
import { PromoterProfileForm } from './PromoterProfileForm';

export const metadata = { title: 'Become a promoter' };
export const dynamic = 'force-dynamic';

export default async function PromoterOnboarding({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next, '/earn');
  const user = await getUser();
  if (!user) redirect(signInUrl(`/onboarding/promoter?next=${encodeURIComponent(target)}`));
  if (!user.email_confirmed_at) return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">Confirm your email first</h1><p className="mt-3">Open the sign-in link we sent you, then return here.</p></main>;
  const { data: profile } = await (await createClient()).from('profiles').select('handle, country, promoter_terms_accepted_at').eq('id', user.id).single();
  const countryHeader = (await headers()).get('cf-ipcountry')?.toUpperCase() ?? '';
  const initialCountry = profile?.country ?? (isCountryCode(countryHeader) ? countryHeader : '');
  if (profile?.handle && profile.promoter_terms_accepted_at) redirect(target);
  return <PromoterProfileForm next={target} initialHandle={profile?.handle ?? ''} initialCountry={initialCountry} countries={COUNTRY_OPTIONS} />;
}
