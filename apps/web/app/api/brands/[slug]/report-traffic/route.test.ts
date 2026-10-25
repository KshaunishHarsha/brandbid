import { beforeEach, describe, expect, it, vi } from 'vitest';

const sameOrigin = vi.fn();
vi.mock('@/lib/same-origin', () => ({ isSameOrigin: (...args: unknown[]) => sameOrigin(...args) }));
const getMemberBrand = vi.fn();
vi.mock('@/lib/dashboard', () => ({ getMemberBrand: (...args: unknown[]) => getMemberBrand(...args) }));
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const BRAND = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const member = { user: { id: USER, email: 'owner@test.dev' }, brand: { id: BRAND, slug: 'acme-brand', status: 'active' } };
const request = (reason: string) => new Request('https://brandbid.wtf/api/brands/acme-brand/report-traffic', {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams({ reason }),
});
const context = (slug = 'acme-brand') => ({ params: Promise.resolve({ slug }) });
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  sameOrigin.mockReset().mockReturnValue(true);
  getMemberBrand.mockReset().mockResolvedValue(member);
  rpc.mockReset();
});

describe('brand suspicious traffic reports', () => {
  it('requires same-origin requests and brand membership', async () => {
    sameOrigin.mockReturnValue(false);
    expect((await POST(request('Suspicious traffic details'), context())).status).toBe(403);
    expect(getMemberBrand).not.toHaveBeenCalled();
    sameOrigin.mockReturnValue(true);
    getMemberBrand.mockResolvedValue(null);
    expect((await POST(request('Suspicious traffic details'), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires an active brand and a useful reason', async () => {
    getMemberBrand.mockResolvedValue({ ...member, brand: { ...member.brand, status: 'removed' } });
    expect((await POST(request('Suspicious traffic details'), context())).status).toBe(404);
    getMemberBrand.mockResolvedValue(member);
    expect(notice(await POST(request('short'), context()))).toContain('10 characters');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the verified member identity and brand to the protected RPC', async () => {
    rpc.mockResolvedValue({ error: null });
    const response = await POST(request('Repeated clicks from one source'), context());
    expect(rpc).toHaveBeenCalledWith('report_brand_suspicious_traffic', {
      p_brand_id: BRAND, p_reporter_id: USER, p_reason: 'Repeated clicks from one source',
    });
    expect(notice(response)).toContain('Report sent');
  });

  it('maps duplicate report limits into a safe dashboard message', async () => {
    rpc.mockResolvedValue({ error: { message: 'brand_report_rate_limited' } });
    const response = await POST(request('Repeated clicks from one source'), context());
    expect(notice(response)).toContain('last 24 hours');
  });
});
