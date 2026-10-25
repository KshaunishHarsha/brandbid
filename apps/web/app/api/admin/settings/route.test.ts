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

const ADMIN = '99999999-9999-4999-8999-999999999999';
const request = (fields: Record<string, string>) => new Request('https://brandbid.wtf/api/admin/settings', {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams(fields),
});
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset();
});

describe('admin settings', () => {
  it('requires the admin guard', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) });
    expect((await POST(request({ key: 'floor_cents', value: '25', reason: 'floor' }))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects unsupported keys, invalid numbers and malformed JSON before calling the database', async () => {
    expect(notice(await POST(request({ key: 'secret', value: '1', reason: 'change' })))).toContain('supported setting');
    expect(notice(await POST(request({ key: 'floor_cents', value: '1.5', reason: 'change' })))).toContain('whole number');
    expect(notice(await POST(request({ key: 'fraud_thresholds', value: '{', reason: 'change' })))).toContain('valid JSON');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes a typed value, reason and authenticated admin to the SQL validator', async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const res = await POST(request({ key: 'floor_cents', value: '25', reason: 'updated minimum' }));
    expect(rpc).toHaveBeenCalledWith('admin_update_setting', {
      p_key: 'floor_cents', p_value: 25, p_reason: 'updated minimum', p_admin_id: ADMIN,
    });
    expect(notice(res)).toContain('saved and audited');
  });
});
