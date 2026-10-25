import { beforeEach, describe, expect, it } from 'vitest';
import { statusToken, verifyStatusToken } from './status-token';

beforeEach(() => {
  process.env.IP_PEPPER = 'test-pepper';
});

describe('status token', () => {
  const brand = '11111111-1111-4111-8111-111111111111';
  it('is stable per brand and verifies', async () => {
    const t = await statusToken(brand);
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(await statusToken(brand)).toBe(t);
    expect(await verifyStatusToken(brand, t)).toBe(true);
  });
  it('is bound to the brand and to the secret', async () => {
    const t = await statusToken(brand);
    expect(await verifyStatusToken('22222222-2222-4222-8222-222222222222', t)).toBe(false);
    process.env.IP_PEPPER = 'other-pepper';
    expect(await verifyStatusToken(brand, t)).toBe(false);
  });
  it('rejects garbage, wrong length and empty tokens', async () => {
    expect(await verifyStatusToken(brand, '')).toBe(false);
    expect(await verifyStatusToken(brand, 'abc')).toBe(false);
    expect(await verifyStatusToken(brand, 'z'.repeat(32))).toBe(false);
  });
});
