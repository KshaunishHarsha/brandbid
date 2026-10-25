import { AccountMenu } from '@/components/AccountMenu';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">brandbid</h1>
        <AccountMenu />
      </header>
      <p className="mt-2 text-sm opacity-70">Leaderboard coming in P1.7.</p>
    </main>
  );
}
