import { logoPublicUrl } from '@/lib/logos';

const SWATCHES: Array<[string, string]> = [
  ['#C7502E', '#F6F3EC'], ['#2F6B4F', '#F6F3EC'], ['#3B2A20', '#F6F3EC'], ['#F2C94C', '#15140F'],
  ['#15140F', '#FF6A2B'], ['#7FB8C9', '#15140F'], ['#1E5EFF', '#FFFFFF'], ['#E8E3FB', '#46329E'], ['#9CC28A', '#15140F'],
];

function swatch(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length];
}

/** The brand's logo, or a coloured monogram when it has none. Decorative: the name is always shown next to it. */
export function BrandLogo({ name, logoPath, size = 44 }: { name: string; logoPath: string | null; size?: number }) {
  const src = logoPublicUrl(logoPath);
  const radius = Math.round(size * 0.25);
  const style = { width: size, height: size, borderRadius: radius };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={style} loading="lazy" className="shrink-0 bg-surface object-cover" />;
  }
  const [bg, fg] = swatch(name);
  const letters = name.trim().slice(0, 2);
  const label = letters ? letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() : '?';
  return (
    <div style={{ ...style, background: bg, color: fg, fontSize: Math.round(size * 0.36) }} aria-hidden className="flex shrink-0 items-center justify-center font-display font-bold">
      {label}
    </div>
  );
}
