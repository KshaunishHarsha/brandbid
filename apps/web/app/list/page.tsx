import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ListWizard } from './ListWizard';

export const metadata = { title: 'List your brand · brandbid' };

export default async function ListPage() {
  const supabase = await createClient();
  const [{ data: categories }, user] = await Promise.all([
    supabase.from('categories').select('id, name, requires_review').order('name'),
    getUser(),
  ]);

  return (
    <main className="mx-auto max-w-xl p-6">
      <Link href="/" className="text-sm opacity-60">← brandbid</Link>
      <h1 className="mt-3 text-2xl font-bold">List your brand</h1>
      <p className="mb-6 mt-1 text-sm opacity-70">
        Pay to claim your spot on the leaderboard. Half of what you pay becomes your ad budget.
      </p>
      <ListWizard
        categories={categories ?? []}
        signedInEmail={user?.email ?? null}
        minBidCents={1000}
      />
    </main>
  );
}
