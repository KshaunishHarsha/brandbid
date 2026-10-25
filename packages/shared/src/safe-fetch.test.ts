import { describe, expect, it, vi } from 'vitest';
import { safeFetch, sniffImage } from './safe-fetch';
import { UnsafeUrlError } from './ssrf';

type Step = { status?: number; headers?: Record<string, string>; body?: string | Uint8Array };

/** A fake fetch that serves `steps` in order, one per request, and records the requested URLs. */
function fake(steps: Step[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const s = steps[Math.min(i++, steps.length - 1)]!;
    return new Response((s.body ?? '') as BodyInit, { status: s.status ?? 200, headers: s.headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const redirect = (to: string, status = 302): Step => ({ status, headers: { location: to } });
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof UnsafeUrlError) return e.reason;
    throw e;
  }
  throw new Error('expected rejection');
};

describe('safeFetch', () => {
  it('fetches a page and reports the final URL, status, type and body', async () => {
    const f = fake([{ body: '<html>hi</html>', headers: { 'content-type': 'text/html; charset=utf-8' } }]);
    const r = await safeFetch('example.com', { fetchImpl: f.impl });
    expect(r.url.toString()).toBe('https://example.com/');
    expect(r.status).toBe(200);
    expect(r.contentType).toContain('text/html');
    expect(new TextDecoder().decode(r.body)).toBe('<html>hi</html>');
    expect(r.truncated).toBe(false);
    expect(f.calls[0]!.init.redirect).toBe('manual');
    expect((f.calls[0]!.init.headers as Record<string, string>)['User-Agent']).toContain('brandbidbot');
  });

  it('follows safe redirects by hand, including relative ones', async () => {
    const f = fake([redirect('https://www.example.com/'), redirect('/home', 301), { body: 'ok' }]);
    const r = await safeFetch('https://example.com', { fetchImpl: f.impl });
    expect(f.calls.map((c) => c.url)).toEqual(['https://example.com/', 'https://www.example.com/', 'https://www.example.com/home']);
    expect(r.url.pathname).toBe('/home');
  });

  it.each([
    ['private IP', 'https://127.0.0.1/admin', 'ip_literal'],
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/', 'ip_literal'],
    ['http downgrade', 'http://example.com/', 'scheme'],
    ['localhost', 'https://localhost/', 'hostname'],
    ['internal name', 'https://db.internal/', 'hostname'],
    ['other port', 'https://example.com:8443/', 'port'],
    ['credentials', 'https://u:p@example.com/', 'credentials'],
  ])('refuses a redirect to %s', async (_n, target, why) => {
    const f = fake([redirect(target)]);
    expect(await reason(safeFetch('https://example.com', { fetchImpl: f.impl }))).toBe(why);
    expect(f.calls).toHaveLength(1); // never requested the bad target
  });

  it('refuses unsafe input without any request', async () => {
    const f = fake([{}]);
    expect(await reason(safeFetch('http://example.com', { fetchImpl: f.impl }))).toBe('scheme');
    expect(f.calls).toHaveLength(0);
  });

  it('stops after the redirect limit', async () => {
    const f = fake([redirect('https://a.example.com/')]);
    expect(await reason(safeFetch('https://example.com', { fetchImpl: f.impl, maxRedirects: 3 }))).toBe('too_many_redirects');
    expect(f.calls).toHaveLength(4); // the original + 3 hops
  });

  it('rejects a redirect with no Location', async () => {
    expect(await reason(safeFetch('https://example.com', { fetchImpl: fake([{ status: 302 }]).impl }))).toBe('redirect_without_location');
  });

  it('caps the body and flags truncation', async () => {
    const r = await safeFetch('https://example.com', { fetchImpl: fake([{ body: 'x'.repeat(5000) }]).impl, maxBytes: 1000 });
    expect(r.body.length).toBe(1000);
    expect(r.truncated).toBe(true);
  });

  it('runs the DNS check before every hop and honours its refusal', async () => {
    const seen: string[] = [];
    const resolveCheck = vi.fn(async (host: string) => {
      seen.push(host);
      if (host === 'rebind.example.com') throw new UnsafeUrlError('dns_private');
    });
    const f = fake([redirect('https://rebind.example.com/')]);
    expect(await reason(safeFetch('https://example.com', { fetchImpl: f.impl, resolveCheck }))).toBe('dns_private');
    expect(seen).toEqual(['example.com', 'rebind.example.com']);
    expect(f.calls).toHaveLength(1); // the rebinding host was never contacted
  });

  it('times out slow servers', async () => {
    const slow = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(safeFetch('https://example.com', { fetchImpl: slow, timeoutMs: 20 })).rejects.toThrow('aborted');
  });

  it('HEAD requests read no body', async () => {
    const f = fake([{ body: 'ignored' }]);
    const r = await safeFetch('https://example.com', { fetchImpl: f.impl, method: 'HEAD' });
    expect(r.body.length).toBe(0);
    expect(f.calls[0]!.init.method).toBe('HEAD');
  });
});

describe('sniffImage', () => {
  const b = (...n: number[]) => new Uint8Array(n);
  it('recognises png, jpeg and webp by magic bytes', () => {
    expect(sniffImage(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: 'image/png', ext: 'png' });
    expect(sniffImage(b(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(sniffImage(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toEqual({ mime: 'image/webp', ext: 'webp' });
  });
  it('rejects SVG, HTML, GIF, empty and truncated input', () => {
    const t = (s: string) => new TextEncoder().encode(s);
    expect(sniffImage(t('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(t('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(t('GIF89a'))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(sniffImage(b(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffImage(t('RIFF....WAVE'))).toBeNull();
  });
});
