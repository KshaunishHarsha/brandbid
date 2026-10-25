import { describe, expect, it } from 'vitest';
import { CODE_PATTERN, isValidCode, randomCode } from './codes';

describe('randomCode', () => {
  it('is 8 base62 characters by default', () => {
    for (let i = 0; i < 1000; i++) expect(randomCode()).toMatch(CODE_PATTERN);
  });
  it('honours a custom length', () => {
    expect(randomCode(3)).toHaveLength(3);
    expect(randomCode(20)).toHaveLength(20);
  });
  it('does not repeat in a large sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) seen.add(randomCode());
    expect(seen.size).toBe(50_000);
  });
  it('has no modulo bias: every character is about equally likely', () => {
    const counts = new Map<string, number>();
    const total = 20_000 * 8;
    for (let i = 0; i < 20_000; i++) {
      for (const ch of randomCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    const expected = total / 62; // ~2581, sd ~50
    for (const n of counts.values()) expect(Math.abs(n - expected)).toBeLessThan(5 * 50);
  });
});

describe('isValidCode', () => {
  it('accepts and rejects', () => {
    expect(isValidCode('k7Qx2aPm')).toBe(true);
    expect(isValidCode('k7Qx2aP')).toBe(false);
    expect(isValidCode('k7Qx2aPm9')).toBe(false);
    expect(isValidCode('k7Qx2a-m')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });
});
