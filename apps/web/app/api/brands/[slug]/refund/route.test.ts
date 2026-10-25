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
const request = () => new Request('https://brandbid.wtf/api/brands/acme-brand/refund', { method: 'POST', headers: { origin: 'https://brandbid.wtf' } });
const context = { params: Promise.resolve({ slug: 'acme-brand' }) };
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  sameOrigin.mockReset().mockReturnValue(true);
  getMemberBrand.mockReset().mockResolvedValue(member);
  rpc.mockReset().mockResolvedValue({ data: { status: 'requested', manual_cents: 0 }, error: null });
});

describe('budget refund requests', () => {
  it('requires same-origin requests and an active brand owner', async () => {
    sameOrigin.mockReturnValue(false);
    expect((await POST(request(), context)).status).toBe(403);
    sameOrigin.mockReturnValue(true);
    getMemberBrand.mockResolvedValue({ ...member, brand: { ...member.brand, role: 'member' } });
    expect((await POST(request(), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the authenticated owner and brand to the guarded RPC', async () => {
    const response = await POST(request(), context);
    expect(rpc).toHaveBeenCalledWith('refund_budget', { p_brand_id: BRAND, p_requester: OWNER });
    expect(notice(response)).toContain('Processor delivery requires');
  });

  it('explains when the payment window requires manual handling', async () => {
    rpc.mockResolvedValue({ data: { status: 'manual', manual_cents: 5000 }, error: null });
    expect(notice(await POST(request(), context))).toContain('manual review');
  });
});
