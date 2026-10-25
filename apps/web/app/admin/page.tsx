import { requireAdmin } from '@/lib/auth';

export default async function Admin() {
  await requireAdmin('/admin');
  return <main className="p-6">Admin (P1.9)</main>;
}
