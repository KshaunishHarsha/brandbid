// SSRF guard for server-side fetches of user-supplied URLs (prefill, logo fetch, listing check).
// BUILD section 8, PHASES P1.6. https only, public hostnames only, no credentials, standard port.
//
// Two layers: parseSafeUrl() checks the URL's syntax and hostname anywhere (including Cloudflare Workers,
// which cannot reach private addresses anyway). Node callers (the worker) additionally resolve DNS and
// run every answer through isPrivateIp().

export class UnsafeUrlError extends Error {
  constructor(public readonly reason: string) {
    super(`Unsafe URL: ${reason}`);
    this.name = 'UnsafeUrlError';
  }
}

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseV4(ip: string): number[] | null {
  const m = V4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateV4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expand an IPv6 string into 8 16-bit groups, or null if it is not valid IPv6. */
function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(':')) return null;

  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseV4(tail);
    if (!v4) return null;
    const hex = (v4[0]! << 8) | v4[1]!;
    const hex2 = (v4[2]! << 8) | v4[3]!;
    s = s.slice(0, lastColon + 1) + hex.toString(16) + ':' + hex2.toString(16);
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function v4FromGroups(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 255, lo >> 8, lo & 255];
}

/** True for any address that must never be fetched: private, loopback, link-local, reserved, or malformed. */
export function isPrivateIp(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) return isPrivateV4(v4);

  const g = parseV6(ip);
  if (!g) return true; // not an IP we understand: treat as unsafe

  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard prefix
  // IPv4 embedded in IPv6: judge by the IPv4 inside
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return isPrivateV4(v4FromGroups(g6, g7)); // ::ffff:a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPrivateV4(v4FromGroups(g6, g7)); // NAT64
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPrivateV4(v4FromGroups(g6, g7)); // v4-compatible
  if (g0 === 0x2002) return isPrivateV4(v4FromGroups(g1, g2)); // 6to4
  return false;
}

export function isIpLiteral(host: string): boolean {
  return parseV4(host) !== null || parseV6(host) !== null;
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.private', '.test', '.invalid', '.example'];

/**
 * Parse and validate a user-supplied URL. Accepts "example.com" (assumes https). Throws UnsafeUrlError.
 * Returns a URL with the fragment removed.
 */
export function parseSafeUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new UnsafeUrlError('length');
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) throw new UnsafeUrlError('whitespace');

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^/?#]*:\d+(\/|$)/.test(raw);
  const candidate = hasScheme ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UnsafeUrlError('invalid');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('scheme');
  if (url.username || url.password) throw new UnsafeUrlError('credentials');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('port');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('hostname');
  if (isIpLiteral(host)) throw new UnsafeUrlError('ip_literal'); // the URL parser also normalises 2130706433 / 0x7f.1 to dotted form
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new UnsafeUrlError('hostname');
  const labels = host.split('.');
  const tld = labels[labels.length - 1]!;
  if (labels.length < 2 || !/^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) throw new UnsafeUrlError('hostname');

  url.hash = '';
  return url;
}

/** Host of a parsed URL without a leading "www.", for duplicate checks and blocklists. */
export function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}
