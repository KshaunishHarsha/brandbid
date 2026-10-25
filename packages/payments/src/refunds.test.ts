import { describe, expect, it } from 'vitest';
import { classifyRefundError, refundRetryDelayMinutes } from './refunds';

describe('classifyRefundError', () => {
  it.each([
    'Razorpay POST /payments/pay_1/refund failed: 400 {"error":{"description":"The payment has been fully refunded already"}}',
    'The payment has already been refunded',
    'payment is fully refunded',
  ])('treats "%s" as already done', (m) => expect(classifyRefundError(new Error(m))).toEqual({ kind: 'already_refunded' }));

  it.each(['Razorpay ... failed: 500 server error', 'network down', 'The refund amount is more than the payment amount', 'fetch failed'])(
    'retries on "%s"',
    (m) => expect(classifyRefundError(new Error(m))).toEqual({ kind: 'retry', message: m }),
  );

  it('handles non-Error values and truncates long messages', () => {
    expect(classifyRefundError('boom')).toEqual({ kind: 'retry', message: 'boom' });
    const out = classifyRefundError(new Error('x'.repeat(2000)));
    expect(out.kind === 'retry' && out.message.length).toBe(500);
  });
});

describe('refundRetryDelayMinutes', () => {
  it('doubles from 1 minute and caps at 6 hours', () => {
    expect([0, 1, 2, 3, 4].map(refundRetryDelayMinutes)).toEqual([1, 2, 4, 8, 16]);
    expect(refundRetryDelayMinutes(8)).toBe(256);
    expect(refundRetryDelayMinutes(9)).toBe(360);
    expect(refundRetryDelayMinutes(50)).toBe(360);
    expect(refundRetryDelayMinutes(-3)).toBe(1);
  });
});
