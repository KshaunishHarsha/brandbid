import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin('/admin');
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-lg font-extrabold tracking-tight">brandbid</Link>
          <span className="rounded bg-danger/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-danger">Admin</span>
          <nav aria-label="Admin" className="flex gap-4 text-sm font-medium">
            <Link href="/admin" className="hover:underline">Overview</Link>
            <Link href="/admin/listings" className="hover:underline">Listings</Link>
            <Link href="/admin/fraud" className="hover:underline">Fraud</Link>
            <Link href="/admin/users" className="hover:underline">Users</Link>
            <Link href="/admin/brands" className="hover:underline">Brands</Link>
            <Link href="/admin/reconciliation" className="hover:underline">Reconciliation</Link>
            <Link href="/admin/settings" className="hover:underline">Settings</Link>
          </nav>
        </div>
        <span className="text-xs text-muted">{admin.email}</span>
      </header>
      {children}
    </div>
  );
}
