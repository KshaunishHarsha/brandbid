import type { PaymentProcessor } from './types';

// Payment webhook logic, with every side effect injected so it can be tested without a network.
//
// Rules (BUILD s7 rule 8, s20):
//  - Only a valid processor signature over the raw body is trusted.
//  - The bid is recorded by the SQL function record_bid, which is idempotent on the payment id.
//  - A payment we cannot record (unknown or rejected brand, below minimum, wrong currency, missing
//    attribution) is refunded in full and logged, never silently kept.
//  - 200 means "done, don't retry". 5xx means "retry me" (the processor re-sends).

export type RecordBidArgs = {
  brandId: string;
  payerId: string;
  amountCents: number;
  processor: string;
  paymentId: string;
  email: string | null;
  fingerprint: string | null;
};

export type RecordBidResult =
  | { ok: true; created: boolean }
  | { ok: false; code: string | null; message: string };

export type WebhookDeps = {
  processor: PaymentProcessor;
  recordBid: (args: RecordBidArgs) => Promise<RecordBidResult>;
  /** Has this payment already been auto-refunded? Makes refunds safe under webhook retries. */
  wasRefunded: (paymentId: string) => Promise<boolean>;
  audit: (action: string, details: Record<string, unknown>) => Promise<void>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
};

export type WebhookResult = { status: number; body: string };

/** record_bid error messages that mean "this payment can never be recorded". */
const UNRECORDABLE = new Set(['brand_not_found', 'brand_not_payable', 'bid_below_minimum']);
const FK_VIOLATION = '23503'; // payer id does not exist

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handlePaymentWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signature: string,
): Promise<WebhookResult> {
  const { processor } = deps;
  const log = deps.log ?? (() => {});

  if (!(await processor.verifyWebhook(rawBody, signature))) {
    return { status: 401, body: 'invalid signature' };
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: 'invalid json' };
  }

  const payment = processor.parseEvent(json);
  if (!payment) return { status: 200, body: 'ignored' };

  async function refundAndLog(reason: string): Promise<WebhookResult> {
    if (!payment) throw new Error('unreachable');
    if (await deps.wasRefunded(payment.paymentId)) return { status: 200, body: 'already refunded' };
    const refundRef = await processor.refund(payment.paymentId, payment.amountCents, reason); // throws -> 500 -> retried
    await deps.audit('payment_auto_refunded', {
      payment_id: payment.paymentId,
      amount_cents: payment.amountCents,
      reason,
      refund_ref: refundRef,
    });
    log('payment auto-refunded', { paymentId: payment.paymentId, reason });
    return { status: 200, body: 'refunded' };
  }

  try {
    if (payment.currency !== 'USD') return await refundAndLog('wrong_currency');
    if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0) {
      return await refundAndLog('invalid_amount');
    }

    let notes = payment.notes;
    if ((!notes.brand_id || !notes.payer_id) && payment.orderId) {
      notes = { ...(await processor.fetchOrderNotes(payment.orderId)), ...notes };
    }
    const { brand_id: brandId, payer_id: payerId } = notes;
    if (!brandId || !payerId || !UUID.test(brandId) || !UUID.test(payerId)) {
      return await refundAndLog('missing_attribution');
    }

    const result = await deps.recordBid({
      brandId,
      payerId,
      amountCents: payment.amountCents,
      processor: payment.processor,
      paymentId: payment.paymentId,
      email: payment.email,
      fingerprint: payment.fingerprint,
    });

    if (result.ok) return { status: 200, body: result.created ? 'recorded' : 'duplicate' };

    if (UNRECORDABLE.has(result.message) || result.code === FK_VIOLATION) {
      return await refundAndLog(UNRECORDABLE.has(result.message) ? result.message : 'payer_not_found');
    }
    throw new Error(`record_bid failed: ${result.message}`);
  } catch (err) {
    log('webhook error', { error: err instanceof Error ? err.message : String(err) });
    return { status: 500, body: 'retry' };
  }
}
