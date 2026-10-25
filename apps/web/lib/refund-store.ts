import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brandbid/db';
import { MAX_REFUND_ATTEMPTS } from '@brandbid/payments';
import type { OwedBid, RefundStore } from '@/lib/refunds';

/** RefundStore backed by the bids table (service-role client). */
export function supabaseRefundStore(db: SupabaseClient<Database>): RefundStore {
  return {
    async listOwed(brandId) {
      const { data, error } = await db
        .from('bids')
        .select('id, processor, processor_payment_id, amount_cents, refund_attempts')
        .eq('brand_id', brandId)
        .eq('status', 'refunded')
        .is('refund_ref', null)
        .lt('refund_attempts', MAX_REFUND_ATTEMPTS)
        .order('refunded_at');
      if (error) throw new Error(`listOwed failed: ${error.message}`);
      return (data ?? []).map((b): OwedBid => ({
        id: b.id, processor: b.processor, paymentId: b.processor_payment_id, amountCents: Number(b.amount_cents), attempts: b.refund_attempts,
      }));
    },
    async claim(bidId) {
      const now = new Date();
      const lease = new Date(now.getTime() + 5 * 60_000).toISOString();
      const { data, error } = await db
        .from('bids')
        .update({ refund_retry_at: lease })
        .eq('id', bidId)
        .eq('status', 'refunded')
        .is('refund_ref', null)
        .or(`refund_retry_at.is.null,refund_retry_at.lte.${now.toISOString()}`)
        .select('id');
      if (error) throw new Error(`claim failed: ${error.message}`);
      return (data?.length ?? 0) === 1;
    },
    async markRefunded(bidId, ref) {
      const { error } = await db.from('bids').update({ refund_ref: ref, refund_last_error: null }).eq('id', bidId);
      if (error) throw new Error(`markRefunded failed: ${error.message}`);
      if (ref !== 'already_refunded') {
        await db.from('audit_log').insert({ action: 'listing_refund_issued', subject_type: 'bid', subject_id: bidId, details: { refund_ref: ref } });
      }
    },
    async markFailed(bidId, attempts, message, retryInMinutes) {
      const { error } = await db
        .from('bids')
        .update({ refund_attempts: attempts, refund_last_error: message, refund_retry_at: new Date(Date.now() + retryInMinutes * 60_000).toISOString() })
        .eq('id', bidId);
      if (error) throw new Error(`markFailed failed: ${error.message}`);
    },
  };
}
