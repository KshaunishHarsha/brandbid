import { RESERVED_HANDLES } from './constants';

/** "Café Ünïcode Inc." -> "cafe-unicode-inc". Always returns a valid slug (BUILD brands.slug check). */
export function slugify(name: string, max = 40): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  const slug = base || 'brand';
  return RESERVED_HANDLES.has(slug) ? `${slug}-brand` : slug;
}

/** Candidate slugs to try in order: base, base-2, base-3 ... then random suffixes. */
export function slugCandidates(base: string, attempts = 6): string[] {
  const out = [base];
  for (let i = 2; i <= attempts; i++) out.push(`${base.slice(0, 40 - String(i).length - 1)}-${i}`);
  return out;
}
