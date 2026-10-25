const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function cookieValue(cookieHeader: string, name: string): string | null {
  const entries = cookieHeader.split(';').map((part) => part.trim()).filter(Boolean);
  const direct = entries.find((part) => part.startsWith(`${name}=`));
  if (direct) return decodeURIComponent(direct.slice(name.length + 1));
  const chunks = entries.map((part) => {
    const index = part.indexOf('=');
    return { key: part.slice(0, index), value: part.slice(index + 1) };
  }).filter(({ key }) => key.startsWith(`${name}.`))
    .map(({ key, value }) => ({ index: Number(key.slice(name.length + 1)), value }))
    .filter(({ index }) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!chunks.length || chunks.some((chunk, index) => chunk.index !== index)) return null;
  try { return chunks.map((chunk) => decodeURIComponent(chunk.value)).join(''); } catch { return null; }
}

/** Verify a Supabase SSR session locally. Returns null if the cookie or signing key is unavailable. */
export async function viewerIdFromAuthCookie(cookieHeader: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!supabaseUrl || !jwtSecret) return null;
  let projectRef: string;
  try { projectRef = new URL(supabaseUrl).hostname.split('.')[0]; } catch { return null; }
  const stored = cookieValue(cookieHeader, `sb-${projectRef}-auth-token`);
  if (!stored) return null;
  let parsed: unknown;
  try {
    const json = stored.startsWith('base64-')
      ? decoder.decode(decodeBase64Url(stored.slice(7)) ?? new Uint8Array())
      : stored;
    parsed = JSON.parse(json);
  } catch { return null; }
  const token = typeof parsed === 'string' ? parsed
    : Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0]
      : parsed && typeof parsed === 'object' && 'access_token' in parsed && typeof parsed.access_token === 'string' ? parsed.access_token
        : null;
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const headerBytes = decodeBase64Url(parts[0]);
  const payloadBytes = decodeBase64Url(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!headerBytes || !payloadBytes || !signature) return null;
  try {
    const header = JSON.parse(decoder.decode(headerBytes)) as { alg?: string };
    const claims = JSON.parse(decoder.decode(payloadBytes)) as { sub?: string; exp?: number; nbf?: number; role?: string; aud?: string | string[] };
    const authenticatedAudience = claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated'));
    if (header.alg !== 'HS256' || claims.role !== 'authenticated' || !authenticatedAudience || !claims.sub || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now || (typeof claims.nbf === 'number' && claims.nbf > now)) return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(signatureBuffer).set(signature);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBuffer, encoder.encode(`${parts[0]}.${parts[1]}`));
    return valid ? claims.sub : null;
  } catch { return null; }
}
