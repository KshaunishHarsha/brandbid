// HMAC-SHA256 hashing for IPs, user agents, fingerprints (BUILD section 13, 20).
// Web Crypto only, so it runs identically on the edge and in Node.
const encoder = new TextEncoder();

export async function hmac(pepper: string, value: string): Promise<string> {
  if (!pepper) throw new Error('IP_PEPPER is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Combined IP + user-agent visitor key (key_type 'ipua'). */
export function ipUaKey(pepper: string, ipHash: string, uaHash: string): Promise<string> {
  return hmac(pepper, `${ipHash}|${uaHash}`);
}
