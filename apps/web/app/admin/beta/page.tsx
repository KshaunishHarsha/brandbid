import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getBetaAllowlist } from '@/lib/beta';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Promoter beta' };
export const dynamic = 'force-dynamic';

export default async function AdminBeta() {
  await requireAdmin('/admin/beta');
  const [setting, waitlist] = await Promise.all([
    getBetaAllowlist(),
    createAdminClient().from('beta_waitlist').select('email, created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const open = setting === null;
  const emails = Array.isArray(setting) ? setting.filter((x): x is string => typeof x === 'string') : [];
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/admin" className="text-sm underline">← Admin</Link>
      <h1 className="text-2xl font-bold">Promoter beta</h1>
      <p className="text-sm text-muted">The beta is {open ? 'open to everyone' : `limited to ${emails.length} email addresses`}.</p>
      <form action="/api/admin/beta" method="post" className="space-y-3">
        <label htmlFor="emails" className="block text-sm font-medium">Allowed emails, one per line</label>
        <textarea id="emails" name="emails" rows={10} defaultValue={emails.join('\n')} className="w-full rounded-lg border border-line bg-surface p-3" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open" defaultChecked={open} /> Open the beta to everyone</label>
        <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg">Save beta access</button>
      </form>
      <section>
        <h2 className="font-semibold">Waitlist ({waitlist.data?.length ?? 0} most recent)</h2>
        <ul className="mt-2 space-y-1 text-sm">{(waitlist.data ?? []).map((row) => <li key={row.email}>{row.email}</li>)}</ul>
      </section>
    </main>
  );
}
