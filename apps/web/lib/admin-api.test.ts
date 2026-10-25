import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, getUser: () => getUser() };
});

import { createClient } from '@/lib/supabase/server';
import { adminErrorNotice, backToQueue, isSameOrigin, requireAdminApi } from './admin-api';

const post = (origin: string | null, url = 'https://brandbid.wtf/api/admin/listings/x/approve') =>
  new Request(url, { method: 'POST', headers: origin === null ? {} : { origin } });

function asProfile(isAdmin: boolean | null) {
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: isAdmin === null ? null : { is_admin: isAdmin } }) }) }) }),
  });
}
const recent = () => new Date(Date.now() - 60_000).toISOString();
const old = () => new Date(Date.now() - 13 * 3_600_000).toISOString();

beforeEach(() => {
  getUser.mockReset();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('isSameOrigin', () => {
  it('accepts the request\'s own origin', () => expect(isSameOrigin(post('https://brandbid.wtf'))).toBe(true));
  it.each([
    ['another site', 'https://evil.com'],
    ['a look-alike host', 'https://brandbid.wtf.evil.com'],
    ['a sibling subdomain', 'https://staging.brandbid.wtf'],
    ['a different scheme', 'http://brandbid.wtf'],
    ['a different port', 'https://brandbid.wtf:8443'],
    ['the literal string "null" (sandboxed iframes)', 'null'],
    ['garbage', 'not a url'],
    ['empty', ''],
  ])('refuses %s', (_n, origin) => expect(isSameOrigin(post(origin))).toBe(false));
  it('refuses a request with no Origin header at all', () => expect(isSameOrigin(post(null))).toBe(false));
  it('also accepts the configured public site URL (proxies can change the request host)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://brandbid.wtf';
    expect(isSameOrigin(post('https://brandbid.wtf', 'http://internal-host:3000/x'))).toBe(true);
    expect(isSameOrigin(post('https://evil.com', 'http://internal-host:3000/x'))).toBe(false);
  });
});

describe('requireAdminApi', () => {
  it('403 for a cross-site request, without even looking up the user', async () => {
    const r = await requireAdminApi(post('https://evil.com'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.response.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });
  it('401 when not signed in', async () => {
    getUser.mockResolvedValue(null);
    const r = await requireAdminApi(post('https://brandbid.wtf'));
    expect(!r.ok && r.response.status).toBe(401);
  });
  it('404 (not 403) for a signed-in non-admin, so admin endpoints are not revealed', async () => {
    getUser.mockResolvedValue({ id: 'u1', last_sign_in_at: recent() });
    asProfile(false);
    expect((await requireAdminApi(post('https://brandbid.wtf')) as { response: Response }).response.status).toBe(404);
    asProfile(null);
    expect((await requireAdminApi(post('https://brandbid.wtf')) as { response: Response }).response.status).toBe(404);
  });
  it('asks an admin whose sign-in is over 12 hours old to sign in again', async () => {
    getUser.mockResolvedValue({ id: 'a1', last_sign_in_at: old() });
    asProfile(true);
    const r = await requireAdminApi(post('https://brandbid.wtf'));
    expect(!r.ok && r.response.status).toBe(401);
    expect(!r.ok && (await r.response.json())).toEqual({ error: 'sign_in_again' });
  });
  it('lets a recently signed-in admin through, returning who they are', async () => {
    getUser.mockResolvedValue({ id: 'a1', last_sign_in_at: recent() });
    asProfile(true);
    expect(await requireAdminApi(post('https://brandbid.wtf'))).toEqual({ ok: true, adminId: 'a1' });
  });
});

describe('responses', () => {
  it('backToQueue is a 303 to the queue with an encoded notice', () => {
    const res = backToQueue(post('https://brandbid.wtf'), 'Done & dusted');
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://brandbid.wtf/admin/listings');
    expect(location.searchParams.get('notice')).toBe('Done & dusted');
  });
  it('adminErrorNotice explains known errors and hides unknown ones', () => {
    expect(adminErrorNotice('reason_required')).toContain('reason');
    expect(adminErrorNotice('brand_not_reviewable')).toContain('not waiting for review');
    expect(adminErrorNotice('relation "secret_table" does not exist')).toBe('Something went wrong. Nothing was changed.');
  });
});
