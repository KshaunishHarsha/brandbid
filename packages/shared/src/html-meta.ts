// Extract listing prefill data from HTML without a DOM (runs on Cloudflare Workers and Node).

export type PrefillMeta = { name: string; description: string; image: string | null };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim();

function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

function metaMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const head = html.slice(0, 200_000);
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    if (key && attrs.content !== undefined && !map.has(key)) map.set(key, attrs.content);
  }
  return map;
}

/** "Acme - Rockets for everyone | Acme Inc" -> "Acme" */
function nameFromTitle(title: string): string {
  const first = title.split(/\s+[|–—·•:-]\s+|\s*[|–—·•]\s*/)[0] ?? title;
  return first.trim();
}

export function parseMeta(html: string, baseUrl: string): PrefillMeta {
  const meta = metaMap(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.slice(0, 200_000))?.[1] ?? '';

  const siteName = clean(meta.get('og:site_name') ?? '');
  const ogTitle = clean(meta.get('og:title') ?? '');
  const title = clean(titleTag);
  const name = truncateAtWord(siteName || nameFromTitle(ogTitle || title), 60);

  const description = truncateAtWord(
    clean(meta.get('og:description') ?? meta.get('description') ?? meta.get('twitter:description') ?? ''),
    160,
  );

  let image: string | null = null;
  const rawImage = (meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image') ?? '').trim();
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage), baseUrl);
      image = u.protocol === 'https:' ? u.toString() : null; // https only
    } catch {
      image = null;
    }
  }
  return { name, description, image };
}
