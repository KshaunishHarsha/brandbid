import { isSupportedKind, renderEmail, SUPPORTED_KINDS } from '@brandbid/emails';
import type { JobContext } from '../context.js';

// Drains notification_outbox (BUILD section 19). Only kinds that have a template are sent; the rest wait for their
// phase. A failed send is retried with doubling backoff (1, 2, 4 ... minutes, max 6 h) up to MAX_ATTEMPTS.
export const MAX_NOTIFY_ATTEMPTS = 8;

export async function runNotify(
  ctx: Pick<JobContext, 'pool' | 'send' | 'siteUrl'>,
  batch = 20,
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  const client = await ctx.pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select o.id, o.kind, o.payload, o.attempts, coalesce(o.recipient_email, u.email) as email
         from public.notification_outbox o
         left join auth.users u on u.id = o.recipient_user_id
        where o.sent_at is null and o.send_after <= now() and o.attempts < $1 and o.kind = any($2)
        order by o.send_after, o.id
        limit $3
        for update of o skip locked`,
      [MAX_NOTIFY_ATTEMPTS, [...SUPPORTED_KINDS], batch],
    );

    for (const row of rows) {
      if (!row.email) {
        await client.query(`update public.notification_outbox set attempts = $2, last_error = 'no recipient email' where id = $1`, [row.id, MAX_NOTIFY_ATTEMPTS]);
        result.failed++;
        continue;
      }
      const mail = isSupportedKind(row.kind) ? renderEmail(row.kind, row.payload ?? {}, { siteUrl: ctx.siteUrl }) : null;
      if (!mail) continue;
      try {
        await ctx.send({ to: row.email, ...mail });
        await client.query(`update public.notification_outbox set sent_at = now(), last_error = null where id = $1`, [row.id]);
        result.sent++;
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        await client.query(
          `update public.notification_outbox
              set attempts = attempts + 1, last_error = $2,
                  send_after = now() + make_interval(mins => least(power(2, attempts)::int, 360))
            where id = $1`,
          [row.id, message],
        );
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
