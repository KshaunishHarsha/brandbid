import { isSupportedKind, renderEmail, SUPPORTED_KINDS } from '@brandbid/emails';
import { createHash, randomBytes } from 'node:crypto';
import type { JobContext } from '../context.js';

// Drains notification_outbox (BUILD section 19). Only kinds that have a template are sent; the rest wait for their
// phase. A failed send is retried with doubling backoff (1, 2, 4 ... minutes, max 6 h) up to MAX_ATTEMPTS.
export const MAX_NOTIFY_ATTEMPTS = 8;
const OPTIONAL_PRODUCT_ALERTS = new Set(['outbid', 'budget_below_10']);

export async function runNotify(
  ctx: Pick<JobContext, 'pool' | 'send' | 'siteUrl'>,
  batch = 20,
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  const client = await ctx.pool.connect();
  try {
    await client.query('begin');
    await client.query(`delete from public.email_unsubscribe_tokens where expires_at <= now() or consumed_at < now() - interval '30 days'`);
    const { rows } = await client.query(
      `select o.id, o.kind, o.payload, o.attempts, o.recipient_user_id, coalesce(o.recipient_email, u.email) as email,
              coalesce(p.product_emails_enabled, true) as product_emails_enabled
         from public.notification_outbox o
         left join auth.users u on u.id = o.recipient_user_id
         left join public.profiles p on p.id = o.recipient_user_id
        where o.sent_at is null and o.suppressed_at is null and o.send_after <= now() and o.attempts < $1 and o.kind = any($2)
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
      const optional = OPTIONAL_PRODUCT_ALERTS.has(row.kind);
      if (optional && row.product_emails_enabled === false) {
        await client.query(`update public.notification_outbox set suppressed_at=now(),last_error='recipient opted out of product alerts' where id=$1`, [row.id]);
        continue;
      }
      if (optional && !row.recipient_user_id) {
        await client.query(`update public.notification_outbox set attempts=$2,last_error='optional email requires an account preference' where id=$1`, [row.id, MAX_NOTIFY_ATTEMPTS]);
        result.failed++;
        continue;
      }
      let unsubscribeUrl: string | undefined;
      if (optional) {
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await client.query(
          `insert into public.email_unsubscribe_tokens(token_hash,user_id,category,expires_at) values($1,$2,'product_alerts',now()+interval '90 days')`,
          [tokenHash, row.recipient_user_id],
        );
        unsubscribeUrl = new URL(`/unsubscribe/${token}`, ctx.siteUrl).toString();
      }
      const mail = isSupportedKind(row.kind) ? renderEmail(row.kind, row.payload ?? {}, { siteUrl: ctx.siteUrl, unsubscribeUrl }) : null;
      if (!mail) continue;
      try {
        await ctx.send({ to: row.email, ...mail });
        await client.query(
          `update public.notification_outbox
              set sent_at = now(), last_error = null,
                  payload = case when kind = 'brand_invite' then payload - 'token' else payload end
            where id = $1`,
          [row.id],
        );
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
