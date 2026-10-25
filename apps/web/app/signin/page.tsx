import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { SignInForm } from './SignInForm';

const ERRORS: Record<string, string> = {
  link: 'That sign-in link is invalid or has expired. Request a new one.',
  oauth: 'Google sign-in failed. Try again, or use an email link.',
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getUser()) redirect(target);

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold">Sign in to brandbid</h1>
      <p className="mb-6 mt-1 text-sm opacity-70">No password. We&apos;ll email you a link.</p>
      {error && ERRORS[error] && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{ERRORS[error]}</p>
      )}
      <SignInForm next={target} />
    </main>
  );
}
