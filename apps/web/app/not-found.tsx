import Link from 'next/link';

export const metadata = { title: 'Not found', robots: { index: false } };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3.5 px-5 py-16">
      <div className="flex flex-col gap-3.5 rounded-[20px] bg-ink px-[22px] py-7 text-ink-fg">
        <div className="font-mono text-[11px] uppercase text-ink-muted">404 · not live</div>
        <div className="font-mono text-[96px] font-bold leading-[0.85] tracking-[-0.06em] text-brand">#404</div>
        <h1 className="text-3xl font-extrabold leading-none tracking-[-0.02em]">This brand isn&apos;t on the board.</h1>
        <p className="text-pretty text-sm leading-normal text-[#d7d2c5]">It may be awaiting review, or the listing was removed. If someone shared this link, they won&apos;t earn from it.</p>
        <div className="mt-1.5 flex gap-2">
          <Link href="/" className="rounded-full bg-brand px-4 py-[11px] text-sm font-semibold text-ink hover:text-ink">See the board</Link>
          <Link href="/list" className="rounded-full border-[1.5px] border-ink-fg px-4 py-[9.5px] text-sm font-semibold text-ink-fg hover:text-ink-fg">List a brand</Link>
        </div>
      </div>
    </main>
  );
}
