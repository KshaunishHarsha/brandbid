import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.fn();
vi.mock('@/lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-api')>('@/lib/admin-api');
  return { ...actual, requireAdminApi: (...a: unknown[]) => guard(...a) };
});
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
const issueOwedRefunds = vi.fn();
vi.mock('@/lib/refunds', () => ({ issueOwedRefunds: (...a: unknown[]) => issueOwedRefunds(...a) }));
vi.mock('@/lib/refund-store', () => ({ supabaseRefundStore: () => ({}) }));
vi.mock('@/lib/payments', () => ({ getProcessor: () => ({ name: 'razorpay' }) }));

import { POST as approve } from './approve/route';
import { POST as category } from './category/route';
import { POST as reject } from './reject/route';

const ID = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const req = (path: string, fields: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields);
  return new Request(`https://brandbid.wtf/api/admin/listings/${ID}/${path}`, { method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body });
};
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, adminId: ADMIN });
  rpc.mockReset();
  issueOwedRefunds.mockReset().mockResolvedValue({ refunded: 1, already: 0, failed: 0, skipped: 0 });
});

describe.each([['approve', approve], ['reject', reject], ['category', category]] as const)('%s: access control', (name, handler) => {
  it('does nothing at all when the admin check fails', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) });
    const res = await handler(req(name, { reason: 'x y z', categoryId: '1' }), ctx());
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(issueOwedRefunds).not.toHaveBeenCalled();
  });
  it('rejects a malformed id before touching the database', async () => {
    const res = await handler(req(name, { reason: 'x y z', categoryId: '1' }), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('approve', () => {
  it('approves as the signed-in admin and redirects with a notice', async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const res = await approve(req('approve'), ctx());
    expect(rpc).toHaveBeenCalledWith('approve_listing', { p_brand_id: ID, p_admin_id: ADMIN });
    expect(res.status).toBe(303);
    expect(notice(res)).toContain('live');
  });
  it('explains a database refusal in plain words', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'brand_not_reviewable' } });
    expect(notice(await approve(req('approve'), ctx()))).toContain('not waiting for review');
  });
});

describe('reject', () => {
  it('passes the admin and a trimmed reason, then refunds right away', async () => {
    rpc.mockResolvedValue({ data: { changed: true, refund_cents: 3501 }, error: null });
    const res = await reject(req('reject', { reason: '  Looks like a scam  ' }), ctx());
    expect(rpc).toHaveBeenCalledWith('reject_listing', { p_brand_id: ID, p_admin_id: ADMIN, p_reason: 'Looks like a scam' });
    expect(issueOwedRefunds).toHaveBeenCalledTimes(1);
    expect(notice(res)).toContain('rejected');
    expect(notice(res)).toContain('refund has been issued');
  });
  it('does not try to refund when the database refused the rejection', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'reason_required' } });
    const res = await reject(req('reject', { reason: '' }), ctx());
    expect(issueOwedRefunds).not.toHaveBeenCalled();
    expect(notice(res)).toContain('reason');
  });
  it('still succeeds, and says it will retry, if the processor refund fails or throws', async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    issueOwedRefunds.mockResolvedValueOnce({ refunded: 0, already: 0, failed: 1, skipped: 0 });
    expect(notice(await reject(req('reject', { reason: 'bad site' }), ctx()))).toContain('retried automatically');
    issueOwedRefunds.mockRejectedValueOnce(new Error('network'));
    const res = await reject(req('reject', { reason: 'bad site' }), ctx());
    expect(res.status).toBe(303);
    expect(notice(res)).toContain('shortly');
  });
  it('does not claim a second rejection did anything', async () => {
    rpc.mockResolvedValue({ data: { changed: false }, error: null });
    expect(notice(await reject(req('reject', { reason: 'again' }), ctx()))).toContain('already rejected');
  });
  it('caps the reason at 500 characters', async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    await reject(req('reject', { reason: 'x'.repeat(900) }), ctx());
    expect((rpc.mock.calls[0]![1] as { p_reason: string }).p_reason).toHaveLength(500);
  });
});

describe('category', () => {
  it('changes the category as the signed-in admin', async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const res = await category(req('category', { categoryId: '3' }), ctx());
    expect(rpc).toHaveBeenCalledWith('admin_set_category', { p_brand_id: ID, p_category_id: 3, p_admin_id: ADMIN });
    expect(notice(res)).toBe('Category updated.');
  });
  it.each(['', 'abc', '0', '-2', '1.5'])('refuses category "%s" without calling the database', async (value) => {
    const res = await category(req('category', { categoryId: value }), ctx());
    expect(rpc).not.toHaveBeenCalled();
    expect(notice(res)).toContain('category');
  });
});
