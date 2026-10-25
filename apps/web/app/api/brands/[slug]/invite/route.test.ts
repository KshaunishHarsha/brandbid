import { beforeEach, describe, expect, it, vi } from 'vitest';

const sameOrigin = vi.fn();
vi.mock('@/lib/same-origin', () => ({ isSameOrigin: (...args: unknown[]) => sameOrigin(...args) }));
const getMemberBrand = vi.fn();
vi.mock('@/lib/dashboard', () => ({ getMemberBrand: (...args: unknown[]) => getMemberBrand(...args) }));
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const OWNER = '11111111-1111-4111-8111-111111111111';
const BRAND = '22222222-2222-4222-8222-222222222222';
const member = { user: { id: OWNER }, brand: { id: BRAND, slug: 'acme-brand', status: 'active', role: 'owner' } };
const request = (email: string) => new Request('https://brandbid.wtf/api/brands/acme-brand/invite', {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams({ email }),
});
const context = { params: Promise.resolve({ slug: 'acme-brand' }) };
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  sameOrigin.mockReset().mockReturnValue(true);
  getMemberBrand.mockReset().mockResolvedValue(member);
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe('brand team invites', () => {
  it('requires a same-origin owner session for an active brand', async () => {
    sameOrigin.mockReturnValue(false);
    expect((await POST(request('teammate@example.com'), context)).status).toBe(403);
    sameOrigin.mockReturnValue(true);
    getMemberBrand.mockResolvedValue({ ...member, brand: { ...member.brand, role: 'member' } });
    expect((await POST(request('teammate@example.com'), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates email and sends only a token hash to the invite table while queuing the raw token for mail', async () => {
    const response = await POST(request('  Teammate@Example.com  '), context);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('create_brand_invite');
    expect(args.p_brand_id).toBe(BRAND);
    expect(args.p_invited_by).toBe(OWNER);
    expect(args.p_email).toBe('teammate@example.com');
    expect(args.p_token).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_token_hash).not.toBe(args.p_token);
    expect(notice(response)).toContain('Invitation queued');
  });

  it('rejects malformed email without creating an invite', async () => {
    expect(notice(await POST(request('not-an-email'), context))).toContain('valid email');
    expect(rpc).not.toHaveBeenCalled();
  });
});
