import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createRazorpayProcessor, safeEqual } from './razorpay';

const SECRET = 'whsec_test_123';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
const mk = (fetchImpl?: typeof fetch) =>
  createRazorpayProcessor({ keyId: 'rzp_test_k', keySecret: 'sec', webhookSecret: SECRET, fetchImpl });

const captured = (over: Record<string, unknown> = {}) => ({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_ABC123',
        order_id: 'order_XYZ',
        amount: 5000,
        currency: 'usd',
        email: 'buyer@example.com',
        card_id: 'card_777',
        notes: { brand_id: 'b', payer_id: 'p', n: 7 },
        ...over,
      },
    },
  },
});

describe('safeEqual', () => {
  it('compares', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('verifyWebhook', () => {
  const body = JSON.stringify(captured());
  it('accepts a valid signature over the exact raw body', async () => {
    expect(await mk().verifyWebhook(body, sign(body))).toBe(true);
  });
  it('rejects a tampered body, a wrong secret, and a re-serialised body', async () => {
    const p = mk();
    expect(await p.verifyWebhook(body.replace('5000', '9000'), sign(body))).toBe(false);
    expect(await p.verifyWebhook(body, sign(body, 'other_secret'))).toBe(false);
    expect(await p.verifyWebhook(JSON.stringify(JSON.parse(body), null, 2), sign(body))).toBe(false);
  });
  it('rejects empty or garbage signatures and an unset secret', async () => {
    expect(await mk().verifyWebhook(body, '')).toBe(false);
    expect(await mk().verifyWebhook(body, 'nothex')).toBe(false);
    const noSecret = createRazorpayProcessor({ keyId: 'k', keySecret: 's', webhookSecret: '' });
    expect(await noSecret.verifyWebhook(body, sign(body, ''))).toBe(false);
  });
});

describe('parseEvent', () => {
  it('normalises payment.captured', () => {
    expect(mk().parseEvent(captured())).toEqual({
      processor: 'razorpay',
      paymentId: 'pay_ABC123',
      orderId: 'order_XYZ',
      amountCents: 5000,
      currency: 'USD',
      email: 'buyer@example.com',
      fingerprint: 'card_777',
      notes: { brand_id: 'b', payer_id: 'p', n: '7' },
    });
  });
  it('tolerates missing optional fields', () => {
    const p = mk().parseEvent(captured({ order_id: undefined, email: undefined, card_id: undefined, notes: undefined }));
    expect(p).toMatchObject({ orderId: null, email: null, fingerprint: null, notes: {} });
  });
  it('ignores other events and malformed payloads', () => {
    const p = mk();
    expect(p.parseEvent({ ...captured(), event: 'order.paid' })).toBeNull();
    expect(p.parseEvent({ ...captured(), event: 'payment.failed' })).toBeNull();
    expect(p.parseEvent({ event: 'payment.captured', payload: {} })).toBeNull();
    expect(p.parseEvent(captured({ id: 5 }))).toBeNull();
    expect(p.parseEvent(captured({ amount: '5000' }))).toBeNull();
    expect(p.parseEvent(null)).toBeNull();
    expect(p.parseEvent('x')).toBeNull();
  });
});

describe('API calls', () => {
  const okJson = (data: unknown) => vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch;

  it('createOrder posts USD cents with basic auth and a trimmed receipt', async () => {
    const f = okJson({ id: 'order_1', amount: 1000, currency: 'USD' });
    const order = await mk(f).createOrder({ amountCents: 1000, receipt: 'r'.repeat(80), notes: { brand_id: 'b' } });
    expect(order).toEqual({ orderId: 'order_1', amountCents: 1000, currency: 'USD' });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic ' + btoa('rzp_test_k:sec'));
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ amount: 1000, currency: 'USD', notes: { brand_id: 'b' } });
    expect(sent.receipt).toHaveLength(40);
  });
  it('createOrder rejects bad amounts before calling the network', async () => {
    const f = okJson({});
    for (const a of [0, -5, 10.5, NaN]) {
      await expect(mk(f).createOrder({ amountCents: a, receipt: 'r', notes: {} })).rejects.toThrow(RangeError);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const f = vi.fn(async () => new Response('{"error":"bad"}', { status: 400 })) as unknown as typeof fetch;
    await expect(mk(f).createOrder({ amountCents: 1000, receipt: 'r', notes: {} })).rejects.toThrow(/400/);
  });
  it('fetchOrderNotes and refund hit the right endpoints', async () => {
    const f = okJson({ id: 'rfnd_1', notes: { brand_id: 'b' } });
    expect(await mk(f).fetchOrderNotes('order_1')).toEqual({ brand_id: 'b' });
    expect(await mk(f).refund('pay_1', 700, 'because')).toBe('rfnd_1');
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe('https://api.razorpay.com/v1/orders/order_1');
    expect(calls[1]![0]).toBe('https://api.razorpay.com/v1/payments/pay_1/refund');
    expect(JSON.parse(calls[1]![1].body)).toEqual({ amount: 700, notes: { reason: 'because' } });
  });
});
