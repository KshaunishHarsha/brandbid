import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Email preferences' };
export const dynamic = 'force-dynamic';

export default async function EmailPreferencesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser('/dash/notifications');
  const { notice } = await searchParams;
  const { data } = await createAdminClient().from('profiles').select('product_emails_enabled').eq('id', user.id).single();
  const enabled = data?.product_emails_enabled !== false;
  return <main className="mx-auto max-w-2xl px-4 py-10">
    <h1 className="text-2xl font-bold">Email preferences</h1>
    <p className="mt-2 text-sm text-muted">Choose whether to receive optional product alerts, such as brand outbid and low-budget notices. Important account, payment, earning, security and review messages continue to be sent.</p>
    {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
    <section className="mt-6 rounded-card border border-line bg-surface p-4">
      <p className="font-semibold">Optional product alerts</p>
      <p className="mt-1 text-sm text-muted">Currently {enabled ? 'on' : 'off'}.</p>
      <form method="post" action="/api/account/notifications" className="mt-4">
        <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">{enabled ? 'Unsubscribe from product alerts' : 'Resubscribe to product alerts'}</button>
      </form>
    </section>
  </main>;
}
