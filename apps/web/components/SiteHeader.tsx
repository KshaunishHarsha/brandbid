import Link from 'next/link';
import { AccountMenu } from '@/components/AccountMenu';
import { Wordmark } from '@/components/Wordmark';

export function SiteHeader() {
  return (
    <header className="flex items-center gap-4 border-b border-line py-4 sm:gap-8 sm:py-[18px]">
      <Wordmark />
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium sm:flex">
        <Link href="/" className="hover:text-brand">Boards</Link>
        <Link href="/discover" className="hover:text-brand">Discover</Link>
        <Link href="/promoters" className="hover:text-brand">Promoters</Link>
      </nav>
      <div className="flex-1" />
      <AccountMenu />
      <Link href="/list" className="rounded-full bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-fg hover:text-accent-fg sm:px-[18px] sm:py-2.5 sm:text-sm">
        <span className="sm:hidden">List brand</span><span className="hidden sm:inline">List your brand</span>
      </Link>
    </header>
  );
}
