import { describe, expect, it } from 'vitest';
import { hmac, ipUaKey } from './hash';

describe('hmac', () => {
  it('matches the RFC 4231 test vector', async () => {
    expect(await hmac('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
  it('is deterministic and depends on the pepper', async () => {
    expect(await hmac('a', 'x')).toBe(await hmac('a', 'x'));
    expect(await hmac('a', 'x')).not.toBe(await hmac('b', 'x'));
    expect(await hmac('a', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('refuses an empty pepper', async () => {
    await expect(hmac('', 'x')).rejects.toThrow('IP_PEPPER');
  });
  it('ipUaKey differs by either input', async () => {
    const base = await ipUaKey('p', 'ip1', 'ua1');
    expect(base).not.toBe(await ipUaKey('p', 'ip2', 'ua1'));
    expect(base).not.toBe(await ipUaKey('p', 'ip1', 'ua2'));
  });
});
