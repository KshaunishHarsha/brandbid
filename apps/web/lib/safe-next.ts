/**
 * Validate a post-login redirect target. Only same-site relative paths are allowed, to prevent open
 * redirects ("/signin?next=//evil.com"). Anything else falls back.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  if (next.length > 500) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback; // control chars and backslashes: browsers normalise them into "//"
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  try {
    const u = new URL(next, 'http://internal.invalid');
    if (u.origin !== 'http://internal.invalid') return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
