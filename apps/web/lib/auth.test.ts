import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { isRecentSignIn, signInUrl } from './auth';

describe('isRecentSignIn (admin needs a sign-in within 12 h)', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  it('accepts recent sign-ins', () => {
    expect(isRecentSignIn(ago(0), 12, now)).toBe(true);
    expect(isRecentSignIn(ago(11.9), 12, now)).toBe(true);
    expect(isRecentSignIn(ago(12), 12, now)).toBe(true);
  });
  it('rejects old, missing, invalid or future-dated sign-ins', () => {
    expect(isRecentSignIn(ago(12.1), 12, now)).toBe(false);
    expect(isRecentSignIn(null, 12, now)).toBe(false);
    expect(isRecentSignIn(undefined, 12, now)).toBe(false);
    expect(isRecentSignIn('not a date', 12, now)).toBe(false);
    expect(isRecentSignIn(ago(-5), 12, now)).toBe(false);
  });
});

describe('signInUrl', () => {
  it('encodes the return path', () => {
    expect(signInUrl('/b/acme?advertise=1')).toBe('/signin?next=%2Fb%2Facme%3Fadvertise%3D1');
  });
});
