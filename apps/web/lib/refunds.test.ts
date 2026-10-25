import { describe, expect, it, vi } from 'vitest';
import type { PaymentProcessor } from '@brandbid/payments';
import { issueOwedRefunds, type OwedBid, type RefundStore } from './refunds';

const bid = (id: string, over: Partial<OwedBid> = {}): OwedBid => ({ id, processor: 'razorpay', paymentId: `pay_${id}`, amountCents: 1000, attempts: 0, ...over });

function memoryStore(bids: OwedBid[], held: string[] = []) {
  const refunded: Record<string, string> = {};
  const failed: Record<string, { attempts: number; message: string; minutes: number }> = {};
  const store: RefundStore = {
    listOwed: async () => bids,
    claim: async (id) => !held.includes(id),
    markRefunded: async (id, ref) => void (refunded[id] = ref),
    markFailed: async (id, attempts, message, minutes) => void (failed[id] = { attempts, message, minutes }),
  };
  return { store, refunded, failed };
}
const processor = (impl: (paymentId: string, amount: number) => Promise<string>) => {
  const refund = vi.fn(async (id: string, amount: number) => impl(id, amount));
  return { p: { name: 'razorpay', refund } as unknown as PaymentProcessor, refund };
};

describe('issueOwedRefunds', () => {
  it('refunds every owed bid the exact amount and records the reference', async () => {
    const { store, refunded } = memoryStore([bid('a', { amountCents: 1000 }), bid('b', { amountCents: 2501 })]);
    const { p, refund } = processor(async (id) => `rfnd_${id}`);
    expect(await issueOwedRefunds(store, p, 'brand')).toEqual({ refunded: 2, already: 0, failed: 0, skipped: 0 });
    expect(refund.mock.calls).toEqual([['pay_a', 1000, 'listing_rejected'], ['pay_b', 2501, 'listing_rejected']]);
    expect(refunded).toEqual({ a: 'rfnd_pay_a', b: 'rfnd_pay_b' });
  });

  it('leaves a bid alone when another process (the worker) holds it', async () => {
    const { store, refunded } = memoryStore([bid('a'), bid('b')], ['a']);
    const { p, refund } = processor(async (id) => `rfnd_${id}`);
    expect(await issueOwedRefunds(store, p, 'brand')).toMatchObject({ refunded: 1, skipped: 1 });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(Object.keys(refunded)).toEqual(['b']);
  });

  it('treats "already refunded" as done', async () => {
    const { store, refunded } = memoryStore([bid('a')]);
    const { p } = processor(async () => { throw new Error('The payment has been fully refunded already'); });
    expect(await issueOwedRefunds(store, p, 'brand')).toMatchObject({ already: 1, failed: 0 });
    expect(refunded.a).toBe('already_refunded');
  });

  it('records a failure with backoff, and keeps going with the next bid', async () => {
    const { store, refunded, failed } = memoryStore([bid('a', { attempts: 2 }), bid('b')]);
    const { p } = processor(async (id) => { if (id === 'pay_a') throw new Error('gateway timeout'); return 'rfnd_b'; });
    expect(await issueOwedRefunds(store, p, 'brand')).toMatchObject({ refunded: 1, failed: 1 });
    expect(failed.a).toEqual({ attempts: 3, message: 'gateway timeout', minutes: 4 }); // third failure waits 4 minutes
    expect(refunded.b).toBe('rfnd_b');
  });

  it('never sends a bid to a processor that did not take the payment', async () => {
    const { store, failed } = memoryStore([bid('a', { processor: 'stripe' })]);
    const { p, refund } = processor(async () => 'x');
    expect(await issueOwedRefunds(store, p, 'brand')).toMatchObject({ failed: 1, refunded: 0 });
    expect(refund).not.toHaveBeenCalled();
    expect(failed.a?.message).toContain('stripe');
  });

  it('does nothing when nothing is owed', async () => {
    const { store } = memoryStore([]);
    const { p, refund } = processor(async () => 'x');
    expect(await issueOwedRefunds(store, p, 'brand')).toEqual({ refunded: 0, already: 0, failed: 0, skipped: 0 });
    expect(refund).not.toHaveBeenCalled();
  });
});
