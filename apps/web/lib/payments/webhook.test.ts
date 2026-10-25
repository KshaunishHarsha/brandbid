import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRazorpayProcessor } from '@brandbid/payments';
import { handlePaymentWebhook, type RecordBidResult, type WebhookDeps } from './webhook';

const SECRET = 'whsec';
const BRAND = '11111111-1111-4111-8111-111111111111';
const PAYER = '22222222-2222-4222-8222-222222222222';

const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('hex');
function event(over: Record<string, unknown> = {}, eventName = 'payment.captured') {
  return JSON.stringify({
    event: eventName,
    payload: {
      payment: {
        entity: {
          id: 'pay_1', order_id: 'order_1', amount: 1000, currency: 'USD', email: 'a@b.c', card_id: 'card_1',
          notes: { brand_id: BRAND, payer_id: PAYER }, ...over,
        },
      },
    },
  });
}

let recordBid: ReturnType<typeof vi.fn>;
let refunds: Array<[string, number, string]>;
let audits: Array<[string, Record<string, unknown>]>;
let refundedAlready: boolean;
let orderNotes: Record<string, string>;
let refundFails: boolean;
let afterRecorded: ReturnType<typeof vi.fn>;

function deps(): WebhookDeps {
  const real = createRazorpayProcessor({
    keyId: 'k', keySecret: 's', webhookSecret: SECRET,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/refund')) {
        if (refundFails) return new Response('boom', { status: 500 });
        const body = JSON.parse(String(init?.body));
        refunds.push([u.split('/payments/')[1]!.split('/')[0]!, body.amount, body.notes.reason]);
        return new Response(JSON.stringify({ id: 'rfnd_1' }), { status: 200 });
      }
      if (u.includes('/orders/')) return new Response(JSON.stringify({ notes: orderNotes }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
  });
  return {
    processor: real,
    recordBid: recordBid as unknown as WebhookDeps['recordBid'],
    wasRefunded: async () => refundedAlready,
    audit: async (a, d) => void audits.push([a, d]),
    afterRecorded: afterRecorded as unknown as WebhookDeps['afterRecorded'],
  };
}
const run = (body: string, sig = sign(body)) => handlePaymentWebhook(deps(), body, sig);

beforeEach(() => {
  recordBid = vi.fn(async (): Promise<RecordBidResult> => ({ ok: true, created: true }));
  refunds = [];
  audits = [];
  refundedAlready = false;
  refundFails = false;
  orderNotes = {};
  afterRecorded = vi.fn(async () => {});
});

describe('payment webhook', () => {
  it('rejects a bad signature without touching the database', async () => {
    const body = event();
    expect((await run(body, 'deadbeef')).status).toBe(401);
    expect((await run(body, '')).status).toBe(401);
    expect(recordBid).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON (valid signature) with 400', async () => {
    const body = '{not json';
    expect((await run(body)).status).toBe(400);
    expect(recordBid).not.toHaveBeenCalled();
  });

  it('ignores events we do not act on', async () => {
    const r = await run(event({}, 'payment.failed'));
    expect(r).toEqual({ status: 200, body: 'ignored' });
    expect((await run(event({}, 'order.paid'))).body).toBe('ignored');
    expect(recordBid).not.toHaveBeenCalled();
  });

  it('records a captured payment', async () => {
    const r = await run(event());
    expect(r).toEqual({ status: 200, body: 'recorded' });
    expect(recordBid).toHaveBeenCalledWith({
      brandId: BRAND, payerId: PAYER, amountCents: 1000, processor: 'razorpay',
      paymentId: 'pay_1', email: 'a@b.c', fingerprint: 'card_1',
    });
    expect(refunds).toHaveLength(0);
  });

  it('runs the follow-up only for a NEW bid, never a replay', async () => {
    await run(event());
    expect(afterRecorded).toHaveBeenCalledTimes(1);
    expect(afterRecorded).toHaveBeenCalledWith(expect.objectContaining({ brandId: BRAND, payerId: PAYER, paymentId: 'pay_1' }));
    recordBid.mockResolvedValueOnce({ ok: true, created: false });
    await run(event());
    expect(afterRecorded).toHaveBeenCalledTimes(1);
  });

  it('a failing follow-up never fails the webhook (the bid is already recorded)', async () => {
    afterRecorded.mockRejectedValueOnce(new Error('email down'));
    expect(await run(event())).toEqual({ status: 200, body: 'recorded' });
  });

  it('treats a replayed webhook as success without refunding', async () => {
    recordBid.mockResolvedValueOnce({ ok: true, created: false });
    expect(await run(event())).toEqual({ status: 200, body: 'duplicate' });
    expect(refunds).toHaveLength(0);
  });

  it('reads attribution from the order when the payment has no notes', async () => {
    orderNotes = { brand_id: BRAND, payer_id: PAYER };
    expect((await run(event({ notes: {} }))).body).toBe('recorded');
    expect(recordBid).toHaveBeenCalledWith(expect.objectContaining({ brandId: BRAND, payerId: PAYER }));
  });

  describe('payments that can never be recorded are refunded in full and logged', () => {
    it.each([
      ['no attribution anywhere', { notes: {} }, 'missing_attribution'],
      ['malformed ids', { notes: { brand_id: 'x', payer_id: 'y' } }, 'missing_attribution'],
      ['wrong currency', { currency: 'INR' }, 'wrong_currency'],
      ['zero amount', { amount: 0 }, 'invalid_amount'],
    ])('%s', async (_name, over, reason) => {
      const r = await run(event(over));
      expect(r).toEqual({ status: 200, body: 'refunded' });
      expect(recordBid).not.toHaveBeenCalled();
      expect(refunds).toEqual([['pay_1', (over as { amount?: number }).amount ?? 1000, reason]]);
      expect(audits[0]).toEqual(['payment_auto_refunded', expect.objectContaining({ payment_id: 'pay_1', reason, refund_ref: 'rfnd_1' })]);
    });

    it.each(['brand_not_found', 'brand_not_payable', 'bid_below_minimum'])('database says %s', async (message) => {
      recordBid.mockResolvedValueOnce({ ok: false, code: 'P0001', message });
      expect(await run(event())).toEqual({ status: 200, body: 'refunded' });
      expect(refunds).toEqual([['pay_1', 1000, message]]);
      expect(audits).toHaveLength(1);
    });

    it('payer id does not exist (foreign key violation)', async () => {
      recordBid.mockResolvedValueOnce({ ok: false, code: '23503', message: 'insert violates foreign key' });
      expect((await run(event())).body).toBe('refunded');
      expect(refunds[0]![2]).toBe('payer_not_found');
    });

    it('does not refund twice when the webhook is retried', async () => {
      refundedAlready = true;
      recordBid.mockResolvedValueOnce({ ok: false, code: 'P0001', message: 'brand_not_payable' });
      expect(await run(event())).toEqual({ status: 200, body: 'already refunded' });
      expect(refunds).toHaveLength(0);
    });

    it('asks the processor to retry (500) if the refund itself fails', async () => {
      refundFails = true;
      recordBid.mockResolvedValueOnce({ ok: false, code: 'P0001', message: 'brand_not_payable' });
      expect((await run(event())).status).toBe(500);
      expect(audits).toHaveLength(0); // nothing logged as refunded
    });
  });

  describe('transient failures are retried, never refunded', () => {
    it('unknown database error', async () => {
      recordBid.mockResolvedValueOnce({ ok: false, code: '57P01', message: 'connection terminated' });
      expect((await run(event())).status).toBe(500);
      expect(refunds).toHaveLength(0);
    });
    it('exception while recording', async () => {
      recordBid.mockRejectedValueOnce(new Error('network down'));
      expect((await run(event())).status).toBe(500);
      expect(refunds).toHaveLength(0);
    });
  });
});
