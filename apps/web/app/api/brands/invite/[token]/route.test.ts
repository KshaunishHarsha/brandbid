import { beforeEach, describe, expect, it, vi } from 'vitest';

const sameOrigin = vi.fn();
vi.mock('@/lib/same-origin', () => ({ isSameOrigin: (...args: unknown[]) => sameOrigin(...args) }));
const getUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getUser: (...args: unknown[]) => getUser(...args) }));
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';
import { hashBrandInviteToken } from '@/lib/brand-invites';

const USER = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'ab'.repeat(32);
const request = () => new Request(`https://brandbid.wtf/api/brands/invite/${TOKEN}`, {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' },
});
const context = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  sameOrigin.mockReset().mockReturnValue(true);
  getUser.mockReset().mockResolvedValue({ id: USER, email: 'teammate@example.com' });
  rpc.mockReset().mockResolvedValue({ data: { brand_slug: 'acme-brand' }, error: null });
});

describe('accept brand invite', () => {
  it('requires same-origin and a signed-in user', async () => {
    sameOrigin.mockReturnValue(false);
    expect((await POST(request(), context())).status).toBe(403);
    sameOrigin.mockReturnValue(true);
    getUser.mockResolvedValue(null);
    expect((await POST(request(), context())).status).toBe(303);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('hashes the token and passes the signed-in user to the accepting RPC', async () => {
    const response = await POST(request(), context());
    expect(rpc).toHaveBeenCalledWith('accept_brand_invite', { p_user_id: USER, p_token_hash: await hashBrandInviteToken(TOKEN) });
    expect(new URL(response.headers.get('location')!).pathname).toBe('/dash/brands/acme-brand');
  });

  it('rejects malformed tokens before database access', async () => {
    expect((await POST(request(), context('short'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
