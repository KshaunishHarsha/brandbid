import { classifyRefundError, MAX_REFUND_ATTEMPTS, refundRetryDelayMinutes } from '@brandbid/payments';
import type { JobContext } from '../context.js';

// Returns the money for rejected listings (D38). The database already marked the bids 'refunded'; a bid with no
// refund_ref is a payment we still owe back. Retried with backoff; after MAX_REFUND_ATTEMPTS it is left for an admin
// and an audit row says so.
export async function runProcessRefunds(
  ctx: Pick<JobContext, 'pool' | 'processor'>,
  batch = 10,
): Promise<{ refunded: number; already: number; failed: number }> {
  const result = { refunded: 0, already: 0, failed: 0 };
  const client = await ctx.pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select id, brand_id, processor, processor_payment_id, amount_cents, refund_attempts
         from public.bids
        where status = 'refunded' and refund_ref is null and refund_attempts < $1
          and (refund_retry_at is null or refund_retry_at <= now())
        order by refunded_at, id
        limit $2
        for update skip locked`,
      [MAX_REFUND_ATTEMPTS, batch],
    );

    for (const bid of rows) {
      const amount = Number(bid.amount_cents);
      try {
        if (bid.processor !== ctx.processor.name) throw new Error(`bid was paid through "${bid.processor}", this worker refunds "${ctx.processor.name}"`);
        const ref = await ctx.processor.refund(bid.processor_payment_id, amount, 'listing_rejected');
        await client.query(`update public.bids set refund_ref = $2, refund_last_error = null where id = $1`, [bid.id, ref]);
        await client.query(
          `insert into public.audit_log (action, subject_type, subject_id, details) values ('listing_refund_issued', 'bid', $1, $2)`,
          [bid.id, JSON.stringify({ brand_id: bid.brand_id, payment_id: bid.processor_payment_id, amount_cents: amount, refund_ref: ref })],
        );
        result.refunded++;
      } catch (err) {
        const outcome = classifyRefundError(err);
        if (outcome.kind === 'already_refunded') {
          await client.query(`update public.bids set refund_ref = 'already_refunded', refund_last_error = null where id = $1`, [bid.id]);
          result.already++;
          continue;
        }
        const message = outcome.kind === 'retry' ? outcome.message : '';
        const attempts = Number(bid.refund_attempts) + 1;
        await client.query(
          `update public.bids
              set refund_attempts = $2, refund_last_error = $3, refund_retry_at = now() + make_interval(mins => $4)
            where id = $1`,
          [bid.id, attempts, message, refundRetryDelayMinutes(attempts - 1)],
        );
        if (attempts >= MAX_REFUND_ATTEMPTS) {
          await client.query(
            `insert into public.audit_log (action, subject_type, subject_id, details) values ('listing_refund_failed', 'bid', $1, $2)`,
            [bid.id, JSON.stringify({ brand_id: bid.brand_id, payment_id: bid.processor_payment_id, amount_cents: amount, error: message, needs: 'manual refund' })],
          );
        }
        result.failed++;
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return result;
}
