import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentsMode } from './index';
import { createMockProcessor, MOCK_WEBHOOK_SECRET } from './mock';
import { handlePaymentWebhook } from './webhook';

const BRAND = '11111111-1111-4111-8111-111111111111';
const PAYER = '22222222-2222-4222-8222-222222222222';

describe('mock processor', () => {
  it('creates orders and refunds without any network', async () => {
    const p = createMockProcessor();
    const order = await p.createOrder({ amountCents: 2500, receipt: 'r', notes: { brand_id: BRAND, payer_id: PAYER } });
    expect(order.orderId).toMatch(/^order_mock_/);
    expect(order).toMatchObject({ amountCents: 2500, currency: 'USD' });
    expect(await p.refund('pay_x', 100, 'test')).toMatch(/^rfnd_mock_/);
  });

  it('drives the real webhook handler end to end with a correctly signed payload', async () => {
    const p = createMockProcessor();
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_mock_1', order_id: 'order_mock_1', amount: 2500, currency: 'USD', notes: { brand_id: BRAND, payer_id: PAYER } } } },
    });
    const sig = createHmac('sha256', MOCK_WEBHOOK_SECRET).update(body).digest('hex');
    const recordBid = vi.fn(async () => ({ ok: true as const, created: true }));
    const deps = { processor: p, recordBid, wasRefunded: async () => false, audit: async () => {} };
    expect(await handlePaymentWebhook(deps, body, sig)).toEqual({ status: 200, body: 'recorded' });
    expect(recordBid).toHaveBeenCalledWith(expect.objectContaining({ brandId: BRAND, payerId: PAYER, amountCents: 2500 }));
    expect((await handlePaymentWebhook(deps, body, 'bad')).status).toBe(401);
  });
});

describe('paymentsMode', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
  });
  it('defaults to razorpay and allows mock outside production', () => {
    delete process.env.PAYMENTS_MODE;
    expect(paymentsMode()).toBe('razorpay');
    process.env.PAYMENTS_MODE = 'mock';
    vi.stubEnv('NODE_ENV', 'development');
    expect(paymentsMode()).toBe('mock');
  });
  it('refuses mock mode in production', () => {
    process.env.PAYMENTS_MODE = 'mock';
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => paymentsMode()).toThrow(/not allowed in production/);
  });
});
