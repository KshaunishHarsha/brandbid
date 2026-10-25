import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMemberBrand = vi.fn();
vi.mock('@/lib/dashboard', () => ({ getMemberBrand: (...a: unknown[]) => getMemberBrand(...a) }));
const createOrder = vi.fn();
vi.mock('@/lib/payments', () => ({ getProcessor: () => ({ createOrder }), checkoutKeyId: () => 'rzp_test', paymentsMode: () => 'razorpay' }));
const limit = vi.fn();
vi.mock('@/lib/ratelimit', () => ({ getLimiter: () => ({ limit }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { value: 1000 } }) }) }) }) }) }));

import { POST } from './route';

const member = (status = 'active') => ({ user: { id: 'u1', email: 'o@b.c' }, brand: { id: 'brand-1-uuid', slug: 'acme', status } });
const req = (body: unknown, origin: string | null = 'https://brandbid.wtf') =>
  new Request('https://brandbid.wtf/api/checkout/rerank', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });

beforeEach(() => {
  getMemberBrand.mockReset().mockResolvedValue(member());
  createOrder.mockReset().mockResolvedValue({ orderId: 'order_1', amountCents: 5100, currency: 'USD' });
  limit.mockReset().mockResolvedValue({ success: true });
});

describe('POST /api/checkout/rerank', () => {
  it('creates an order for a member of a live brand, attributing the payment to that member', async () => {
    const res = await POST(req({ slug: 'acme', amount: '51' }));
    expect(res.status).toBe(200);
    expect(createOrder).toHaveBeenCalledWith({ amountCents: 5100, receipt: 'rerank_brand-1-', notes: { brand_id: 'brand-1-uuid', payer_id: 'u1' } });
    expect(await res.json()).toMatchObject({ brandId: 'brand-1-uuid', payerId: 'u1', order: { orderId: 'order_1', keyId: 'rzp_test', mode: 'razorpay' } });
  });
  it('refuses cross-site and Origin-less requests before doing anything', async () => {
    for (const origin of ['https://evil.com', null]) {
      expect((await POST(req({ slug: 'acme', amount: '51' }, origin))).status).toBe(403);
    }
    expect(getMemberBrand).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });
  it('answers 404 for someone who is not a member (indistinguishable from a missing brand)', async () => {
    getMemberBrand.mockResolvedValue(null);
    expect((await POST(req({ slug: 'acme', amount: '51' }))).status).toBe(404);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it.each(['pending_review', 'rejected', 'draft', 'removed'])('does not take money for a %s brand', async (status) => {
    getMemberBrand.mockResolvedValue(member(status));
    const res = await POST(req({ slug: 'acme', amount: '51' }));
    expect(res.status).toBe(409);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it.each([
    ['below the minimum', '5', 'below_minimum'],
    ['above the maximum', '200000', 'above_maximum'],
    ['not a number', 'abc', 'invalid_amount'],
    ['negative', '-20', 'invalid_amount'],
    ['too many decimals', '10.999', 'invalid_amount'],
  ])('rejects an amount that is %s', async (_n, amount, error) => {
    const res = await POST(req({ slug: 'acme', amount }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it('rejects malformed bodies', async () => {
    expect((await POST(req({ slug: 5 }))).status).toBe(400);
    expect((await POST(new Request('https://brandbid.wtf/api/checkout/rerank', { method: 'POST', headers: { origin: 'https://brandbid.wtf' }, body: 'not json' }))).status).toBe(400);
  });
  it('is rate limited per user', async () => {
    limit.mockResolvedValue({ success: false });
    expect((await POST(req({ slug: 'acme', amount: '51' }))).status).toBe(429);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it('reports a payment provider outage without leaking details', async () => {
    createOrder.mockRejectedValue(new Error('Razorpay 500: secret internal detail'));
    const res = await POST(req({ slug: 'acme', amount: '51' }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
