import { describe, expect, it } from 'vitest';
import { isBetaAllowed } from './beta';

describe('beta allowlist', () => {
  it('treats JSON null as open and an empty array as closed', () => {
    expect(isBetaAllowed(null, null)).toBe(true);
    expect(isBetaAllowed([], 'a@example.com')).toBe(false);
  });

  it('matches emails without case sensitivity and fails closed on malformed settings', () => {
    expect(isBetaAllowed(['A@Example.com'], 'a@example.com')).toBe(true);
    expect(isBetaAllowed(['A@Example.com'], 'b@example.com')).toBe(false);
    expect(isBetaAllowed({}, 'a@example.com')).toBe(false);
  });
});
