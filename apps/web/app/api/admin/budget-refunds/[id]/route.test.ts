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
const req = (reference: string) => new Request(`https://brandbid.wtf/api/admin/budget-refunds/${ITEM}`, { method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams({ reference }) });
const ctx = { params: Promise.resolve({ id: ITEM }) };
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  requireAdminApi.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe('manual budget refund completion', () => {
  it('requires the recent same-origin admin API guard', async () => {
    requireAdminApi.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(req('rfnd_123'), ctx)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a valid item id and an external refund reference', async () => {
    expect(notice(await POST(req(''), ctx))).toContain('Enter the completed refund reference');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records, but does not issue, a manually completed refund', async () => {
    const response = await POST(req('rfnd_manual_123'), ctx);
    expect(rpc).toHaveBeenCalledWith('admin_complete_budget_refund_item', { p_admin_id: ADMIN, p_item_id: ITEM, p_reference: 'rfnd_manual_123' });
    expect(notice(response)).toContain('recorded and audited');
  });
});
