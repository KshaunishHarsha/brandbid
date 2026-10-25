import { logoPublicUrl } from '@/lib/logos';

/** The brand's logo, or a monogram when it has none. Decorative: the name is always shown next to it. */
export function BrandLogo({ name, logoPath, size = 44 }: { name: string; logoPath: string | null; size?: number }) {
  const src = logoPublicUrl(logoPath);
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={style} loading="lazy" className="shrink-0 rounded-lg border border-line bg-surface object-cover" />;
  }
  return (
    <div style={style} aria-hidden className="flex shrink-0 items-center justify-center rounded-lg border border-line bg-surface font-bold text-muted">
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </div>
  );
}
