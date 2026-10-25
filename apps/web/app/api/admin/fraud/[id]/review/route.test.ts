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

const FLAG = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const request = (fields: Record<string, string>) => new Request(`https://brandbid.wtf/api/admin/fraud/${FLAG}/review`, {
  method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: new URLSearchParams(fields),
});
const context = (id = FLAG) => ({ params: Promise.resolve({ id }) });
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset();
});

describe('fraud review action', () => {
  it('does not call the database when the admin check fails', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) });
    expect((await POST(request({ decision: 'clear', reason: '' }), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed flag id', async () => {
    expect((await POST(request({ decision: 'clear', reason: '' }), context('bad'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a supported decision and a reason to confirm', async () => {
    expect(notice(await POST(request({ decision: 'maybe', reason: '' }), context()))).toContain('Choose clear or confirm');
    expect(notice(await POST(request({ decision: 'confirm', reason: '  ' }), context()))).toContain('reason');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes clear through to the admin RPC', async () => {
    rpc.mockResolvedValue({ data: { changed: true, decision: 'clear' }, error: null });
    const res = await POST(request({ decision: 'clear', reason: 'safe' }), context());
    expect(rpc).toHaveBeenCalledWith('review_fraud_flag', {
      p_flag_id: FLAG, p_decision: 'clear', p_reason: 'safe', p_admin_id: ADMIN,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/admin/fraud?notice=');
  });

  it('passes a confirmed finding to the atomic reversal RPC', async () => {
    rpc.mockResolvedValue({ data: { changed: true, decision: 'confirm' }, error: null });
    const res = await POST(request({ decision: 'confirm', reason: '  confirmed fraud  ' }), context());
    expect(rpc).toHaveBeenCalledWith('review_fraud_flag', {
      p_flag_id: FLAG, p_decision: 'confirm', p_reason: 'confirmed fraud', p_admin_id: ADMIN,
    });
    expect(notice(res)).toContain('reversed');
  });

  it('caps reasons and turns database errors into safe notices', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'earning_budget_ledger_inconsistent' } });
    expect(notice(await POST(request({ decision: 'confirm', reason: 'x'.repeat(800) }), context()))).toContain('reservation does not add up');
    expect((rpc.mock.calls[0]![1] as { p_reason: string }).p_reason).toHaveLength(500);
  });
});
