import Link from 'next/link';
import { AccountMenu } from '@/components/AccountMenu';

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between py-5">
      <Link href="/" className="text-xl font-extrabold tracking-tight">brandbid</Link>
      <div className="flex items-center gap-4">
        <AccountMenu />
        <Link href="/list" className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg">List your brand</Link>
      </div>
    </header>
  );
}
