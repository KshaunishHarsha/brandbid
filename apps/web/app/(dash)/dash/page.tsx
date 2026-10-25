import { requireUser } from '@/lib/auth';

export default async function Dashboard() {
  const user = await requireUser('/dash');
  return <main className="p-6">Dashboard (P1.10). Signed in as {user.email}.</main>;
}
