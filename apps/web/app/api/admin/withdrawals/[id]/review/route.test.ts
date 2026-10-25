import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApi = vi.fn();
vi.mock('@/lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-api')>('@/lib/admin-api');
  return { ...actual, requireAdminApi: (...args: unknown[]) => requireAdminApi(...args) };
});
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const req = (form: Record<string, string>) => new Request(`https://brandbid.wtf/api/admin/withdrawals/${ITEM}/review`, { method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams(form) });
const ctx = { params: Promise.resolve({ id: ITEM }) };
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  requireAdminApi.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe('withdrawal review', () => {
  it('requires the recent same-origin admin API guard', async () => {
    requireAdminApi.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(req({ decision: 'approve' }), ctx)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates the decision and hold reason before calling the database', async () => {
    expect(notice(await POST(req({ decision: 'pay' }), ctx))).toContain('Choose approve or hold');
    expect(notice(await POST(req({ decision: 'hold', reason: '  ' }), ctx))).toContain('reason');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records approval for processing only', async () => {
    const response = await POST(req({ decision: 'approve' }), ctx);
    expect(rpc).toHaveBeenCalledWith('admin_review_withdrawal', { p_admin_id: ADMIN, p_withdrawal_id: ITEM, p_decision: 'approve', p_reason: null });
    expect(notice(response)).toContain('approved for processing');
  });

  it('records a hold reason', async () => {
    const response = await POST(req({ decision: 'hold', reason: 'Verify account owner' }), ctx);
    expect(rpc).toHaveBeenCalledWith('admin_review_withdrawal', { p_admin_id: ADMIN, p_withdrawal_id: ITEM, p_decision: 'hold', p_reason: 'Verify account owner' });
    expect(notice(response)).toContain('held and reason recorded');
  });
});
