import { describe, expect, it } from 'vitest';
import { hasTurnstileProof } from './qualification';

describe('Turnstile qualification gate', () => {
  it('allows local development when no site key is configured', () => {
    expect(hasTurnstileProof(false, null)).toBe(true);
  });

  it('does not submit a qualification without a token when the challenge is enabled', () => {
    expect(hasTurnstileProof(true, null)).toBe(false);
    expect(hasTurnstileProof(true, '')).toBe(false);
  });

  it('allows submission after Turnstile supplies a token', () => {
    expect(hasTurnstileProof(true, 'valid-turnstile-token')).toBe(true);
  });
});
