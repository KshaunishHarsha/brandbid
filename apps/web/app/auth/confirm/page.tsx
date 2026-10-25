import { safeNext } from '@/lib/safe-next';

// Magic-link landing page. A human presses Continue; scanners that merely fetch this page do nothing.
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  if (!token_hash || !type) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm opacity-70">
          <a className="underline" href="/signin">Request a new sign-in link</a>
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Almost there</h1>
      <p className="mt-2 text-sm opacity-70">Tap continue to finish signing in.</p>
      <form method="post" action="/api/auth/verify" className="mt-6">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={safeNext(next)} />
        <button className="w-full rounded-lg bg-black px-4 py-3 text-white dark:bg-white dark:text-black" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
