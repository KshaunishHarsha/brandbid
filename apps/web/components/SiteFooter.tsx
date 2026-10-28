import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-12 bg-ink text-ink-muted">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-3 px-5 py-7 text-[13px] sm:px-10">
        <span className="font-display text-lg font-extrabold text-ink-fg">brandbid</span>
        <Link href="/earn" className="text-ink-muted hover:text-ink-fg">How it works</Link>
        <Link href="/terms/promoter" className="text-ink-muted hover:text-ink-fg">Terms</Link>
        <span className="flex-1" />
        <span>All amounts USD · Board resets 00:00 UTC</span>
      </div>
    </footer>
  );
}
