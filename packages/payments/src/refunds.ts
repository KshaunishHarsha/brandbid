// Shared rules for issuing the processor refund of a rejected listing (D38). Used by the admin action (immediately)
// and the worker (retries), so both treat errors and backoff the same way.

export const MAX_REFUND_ATTEMPTS = 10;

export type RefundOutcome = { kind: 'refunded'; ref: string } | { kind: 'already_refunded' } | { kind: 'retry'; message: string };

/** Razorpay answers a second refund of a fully refunded payment with an error; that means "already done", not "failed". */
export function classifyRefundError(err: unknown): RefundOutcome {
  const message = err instanceof Error ? err.message : String(err);
  if (/already.{0,40}refunded|fully refunded|refunded already/i.test(message)) return { kind: 'already_refunded' };
  return { kind: 'retry', message: message.slice(0, 500) };
}

/** Minutes to wait before attempt number `attempts + 1`: 1, 2, 4, ... capped at 6 hours. */
export function refundRetryDelayMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts), 360);
}
