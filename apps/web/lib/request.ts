import { hmac } from '@brandbid/shared';

/** Client IP behind Cloudflare (D43). Falls back to proxy headers for local dev. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    '0.0.0.0'
  );
}

function pepper(): string {
  const p = process.env.IP_PEPPER;
  if (p) return p;
  if (process.env.NODE_ENV === 'production') throw new Error('IP_PEPPER is not set');
  return 'dev-pepper-not-secret';
}

/** Raw IPs are never stored or logged; only this HMAC (BUILD section 20). */
export function hashValue(value: string): Promise<string> {
  return hmac(pepper(), value);
}
