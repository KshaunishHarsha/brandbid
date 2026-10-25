// Cloudflare Turnstile server-side verification (BUILD section 4, 14).
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Local dev without keys: allow. Production without keys: fail closed.
    return process.env.NODE_ENV !== 'production';
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
