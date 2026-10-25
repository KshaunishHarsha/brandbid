import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/dash', '/dash'],
    ['/b/acme?advertise=1', '/b/acme?advertise=1'],
    ['/path#frag', '/path#frag'],
    ['/', '/'],
  ])('keeps same-site path %s', (input, expected) => expect(safeNext(input)).toBe(expected));

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['absolute URL', 'https://evil.com'],
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/dash'],
    ['backslash trick', '/\\evil.com'],
    ['tab trick', '/\t/evil.com'],
    ['newline trick', '/\n/evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['no leading slash', 'dash'],
    ['too long', '/' + 'a'.repeat(600)],
  ])('falls back for %s', (_n, input) => {
    expect(safeNext(input as string | null | undefined)).toBe('/');
  });

  it('treats an encoded double slash as a plain, safe path', () => {
    const out = safeNext('/%2f%2fevil.com');
    expect(out.startsWith('/')).toBe(true);
    expect(out.startsWith('//')).toBe(false);
  });

  it('uses a custom fallback', () => expect(safeNext('//x', '/home')).toBe('/home'));
});
