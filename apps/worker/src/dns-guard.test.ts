import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...a: unknown[]) => lookup(...a) }));

import { UnsafeUrlError } from '@brandbid/shared';
import { resolveCheck } from './dns-guard';

const answers = (...addresses: string[]) => lookup.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof UnsafeUrlError ? e.reason : 'other';
  }
  return 'accepted';
};

beforeEach(() => lookup.mockReset());

describe('resolveCheck (DNS rebinding / private-answer guard)', () => {
  it('accepts hosts that resolve only to public addresses', async () => {
    answers('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946');
    expect(await reason(resolveCheck('example.com'))).toBe('accepted');
  });
  it.each([
    ['loopback', ['127.0.0.1']],
    ['cloud metadata', ['169.254.169.254']],
    ['private network', ['10.1.2.3']],
    ['IPv6 loopback', ['::1']],
    ['IPv4-mapped IPv6 loopback', ['::ffff:127.0.0.1']],
    ['unique-local IPv6', ['fd00::5']],
    ['one bad answer among good ones (rebinding trick)', ['93.184.216.34', '10.0.0.5']],
  ])('refuses %s', async (_n, list) => {
    answers(...list);
    expect(await reason(resolveCheck('evil.example.com'))).toBe('dns_private');
  });
  it('refuses names that do not resolve', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await reason(resolveCheck('nope.example.com'))).toBe('dns_unresolvable');
    lookup.mockResolvedValue([]);
    expect(await reason(resolveCheck('empty.example.com'))).toBe('dns_unresolvable');
  });
});
