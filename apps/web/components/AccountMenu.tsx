import { getUser } from '@/lib/auth';

export async function AccountMenu() {
  const user = await getUser();
  if (!user) {
    return (
      <a href="/signin" className="text-sm font-semibold">
        Sign in
      </a>
    );
  }
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm font-semibold">
      <a href="/dash">Dashboard</a>
      <span className="hidden font-normal text-muted lg:inline">{user.email}</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
