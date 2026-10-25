// The only way server code may fetch a user-supplied URL (prefill, logo download, listing probe).
// Every hop is re-validated with parseSafeUrl, redirects are followed by hand (max 3), there is one
// overall timeout, and the body is read with a hard size cap.
import { parseSafeUrl, UnsafeUrlError } from './ssrf';

export type SafeFetchOptions = {
  fetchImpl?: typeof fetch;
  /** Node callers pass a DNS check (resolve the host, reject private answers). Called before every hop. */
  resolveCheck?: (hostname: string) => Promise<void>;
  method?: 'GET' | 'HEAD';
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
};

export type SafeFetchResult = {
  url: URL; // final URL after redirects
  status: number;
  contentType: string;
  body: Uint8Array;
  truncated: boolean;
};

export const BOT_USER_AGENT = 'brandbidbot/1.0 (+https://brandbid.wtf/bot)';

async function readCapped(res: Response, maxBytes: number): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!res.body) return { body: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  return { body, truncated };
}

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    fetchImpl = fetch,
    resolveCheck,
    method = 'GET',
    timeoutMs = 5000,
    maxBytes = 1_000_000,
    maxRedirects = 3,
    headers = {},
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = parseSafeUrl(input);
    for (let hop = 0; ; hop++) {
      await resolveCheck?.(url.hostname);
      const res = await fetchImpl(url.toString(), {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': BOT_USER_AGENT, ...headers },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => {});
        if (!location) throw new UnsafeUrlError('redirect_without_location');
        if (hop >= maxRedirects) throw new UnsafeUrlError('too_many_redirects');
        url = parseSafeUrl(new URL(location, url).toString()); // throws if the redirect target is unsafe
        continue;
      }

      const { body, truncated } = method === 'HEAD' ? { body: new Uint8Array(0), truncated: false } : await readCapped(res, maxBytes);
      if (method === 'HEAD') await res.body?.cancel().catch(() => {});
      return { url, status: res.status, contentType: res.headers.get('content-type') ?? '', body, truncated };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Identify an image by its magic bytes (never trust Content-Type). SVG is deliberately not allowed. */
export function sniffImage(bytes: Uint8Array): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
