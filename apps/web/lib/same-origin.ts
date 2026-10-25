/**
 * Same-origin check for state-changing requests. Admin endpoints use cookie sessions, so a hostile page could
 * otherwise get an admin's browser to submit a form to us. Browsers always send Origin on cross-site POSTs; a request
 * with no Origin is refused.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const allowed = new Set([new URL(req.url).origin]);
    if (process.env.NEXT_PUBLIC_SITE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
