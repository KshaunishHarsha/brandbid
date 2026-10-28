import Link from 'next/link';

export function Wordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <Link href="/" className={`inline-flex items-center font-display font-extrabold tracking-tighter text-fg hover:text-fg ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>
      brand<span className="ml-px rounded-md bg-brand px-1.5">bid</span>
    </Link>
  );
}
