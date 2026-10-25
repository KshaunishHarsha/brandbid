import { getUser } from '@/lib/auth';

export async function AccountMenu() {
  const user = await getUser();
  if (!user) {
    return (
      <a href="/signin" className="text-sm underline">
        Sign in
      </a>
    );
  }
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
      <span className="opacity-70">{user.email}</span>
      <button className="underline" type="submit">
        Sign out
      </button>
    </form>
  );
}
