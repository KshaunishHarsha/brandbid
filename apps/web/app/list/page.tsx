import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { getClaimPrice, getPriceLadder } from '@/lib/leaderboard';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ListWizard } from './ListWizard';

export const metadata = { title: 'List your brand' };
export const dynamic = 'force-dynamic';

export default async function ListPage({ searchParams }: { searchParams: Promise<{ rank?: string }> }) {
  const { rank } = await searchParams;
  const supabase = await createClient();
  const [{ data: categories }, user, ladder, minRow] = await Promise.all([
    supabase.from('categories').select('id, name, requires_review').order('name'),
    getUser(),
    getPriceLadder(null),
    createAdminClient().from('settings').select('value').eq('key', 'min_bid_cents').single(),
  ]);
  const minBidCents = Number(minRow.data?.value ?? 1000);

  // Arrived from "Take #N for $X" on the board: start with that price selected.
  const wantedRank = Number(rank);
  const quoted = Number.isInteger(wantedRank) && wantedRank >= 1 ? await getClaimPrice(null, wantedRank).catch(() => null) : null;
  const initialCents = quoted ?? minBidCents;

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
        minBidCents={minBidCents}
        ladder={ladder}
        initialCents={initialCents}
      />
    </main>
  );
}
