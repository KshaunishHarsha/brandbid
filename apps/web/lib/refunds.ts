import { classifyRefundError, MAX_REFUND_ATTEMPTS, refundRetryDelayMinutes, type PaymentProcessor } from '@brandbid/payments';

// Immediate processor refunds after an admin rejects a listing (D38). The worker's process-refunds job retries anything
// that fails here, using the same rules (classifyRefundError, backoff). A short lease on each bid stops the worker and
// this code from refunding the same payment at the same moment.

export type OwedBid = { id: string; processor: string; paymentId: string; amountCents: number; attempts: number };

export interface RefundStore {
  listOwed(brandId: string): Promise<OwedBid[]>;
  /** Atomically take a 5-minute lease on the bid. False if someone else holds it or it is no longer owed. */
  claim(bidId: string): Promise<boolean>;
  markRefunded(bidId: string, ref: string): Promise<void>;
  markFailed(bidId: string, attempts: number, message: string, retryInMinutes: number): Promise<void>;
}

export type RefundSummary = { refunded: number; already: number; failed: number; skipped: number };

export async function issueOwedRefunds(store: RefundStore, processor: PaymentProcessor, brandId: string): Promise<RefundSummary> {
  const summary: RefundSummary = { refunded: 0, already: 0, failed: 0, skipped: 0 };
  for (const bid of await store.listOwed(brandId)) {
    if (!(await store.claim(bid.id))) {
      summary.skipped++;
      continue;
    }
    try {
      if (bid.processor !== processor.name) throw new Error(`bid was paid through "${bid.processor}", not "${processor.name}"`);
      await store.markRefunded(bid.id, await processor.refund(bid.paymentId, bid.amountCents, 'listing_rejected'));
      summary.refunded++;
    } catch (err) {
      const outcome = classifyRefundError(err);
      if (outcome.kind === 'already_refunded') {
        await store.markRefunded(bid.id, 'already_refunded');
        summary.already++;
      } else {
        const attempts = bid.attempts + 1;
        await store.markFailed(bid.id, attempts, outcome.kind === 'retry' ? outcome.message : '', refundRetryDelayMinutes(attempts - 1));
        summary.failed++;
      }
    }
  }
  return summary;
}

export { MAX_REFUND_ATTEMPTS };
