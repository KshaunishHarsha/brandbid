import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.fn();
vi.mock('@/lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-api')>('@/lib/admin-api');
  return { ...actual, requireAdminApi: (...args: unknown[]) => guard(...args) };
});
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const request = (fields: Record<string, string>) => new Request(`https://brandbid.wtf/api/admin/brands/${BRAND}/action`, {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams(fields),
});
const context = (id = BRAND) => ({ params: Promise.resolve({ id }) });
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset();
});

describe('admin brand actions', () => {
  it('requires the admin guard and validates the brand id', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) });
    expect((await POST(request({ action: 'remove', reason: 'policy' }), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    guard.mockResolvedValue({ ok: true, adminId: ADMIN });
    expect((await POST(request({ action: 'remove', reason: 'policy' }), context('bad'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates action and reason before the database call', async () => {
    expect(notice(await POST(request({ action: 'reject', reason: 'policy' }), context()))).toContain('Choose disable ads or remove');
    expect(notice(await POST(request({ action: 'remove', reason: '  ' }), context()))).toContain('reason');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['disable_ads', 'admin_disable_brand_ads', 'Ads and active links disabled'],
    ['remove', 'admin_remove_brand', 'Brand removed'],
  ] as const)('calls safe %s RPC with admin identity', async (action, name, message) => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const res = await POST(request({ action, reason: '  policy violation  ', q: 'search term' }), context());
    expect(rpc).toHaveBeenCalledWith(name, { p_brand_id: BRAND, p_reason: 'policy violation', p_admin_id: ADMIN });
    expect(notice(res)).toContain(message);
    expect(new URL(res.headers.get('location')!).searchParams.get('q')).toBe('search term');
  });
});
