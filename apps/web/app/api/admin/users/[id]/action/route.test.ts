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

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const request = (fields: Record<string, string>) => new Request(`https://brandbid.wtf/api/admin/users/${USER}/action`, {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams(fields),
});
const context = (id = USER) => ({ params: Promise.resolve({ id }) });
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset();
});

describe('admin user actions', () => {
  it('requires the admin guard and a valid user id', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) });
    expect((await POST(request({ action: 'ban', reason: 'abuse' }), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    guard.mockResolvedValue({ ok: true, adminId: ADMIN });
    expect((await POST(request({ action: 'ban', reason: 'abuse' }), context('bad'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates action and reason before calling the database', async () => {
    expect(notice(await POST(request({ action: 'delete', reason: 'abuse' }), context()))).toContain('Choose suspend or ban');
    expect(notice(await POST(request({ action: 'suspend', reason: '  ' }), context()))).toContain('reason');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['suspend', 'admin_suspend_promoter', 'Account suspended'],
    ['ban', 'admin_ban_promoter', 'Account banned'],
  ] as const)('calls the safe %s RPC with the admin identity', async (action, name, message) => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const res = await POST(request({ action, reason: '  confirmed abuse  ' }), context());
    expect(rpc).toHaveBeenCalledWith(name, { p_promoter_id: USER, p_reason: 'confirmed abuse', p_admin_id: ADMIN });
    expect(notice(res)).toContain(message);
  });
});
