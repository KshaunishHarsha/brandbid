// Concurrency integration for `settle_due_earnings()` against local Supabase.
import { randomUUID } from 'node:crypto';
import { createPool } from '../db.js';

const pool = createPool();
const tag = randomUUID().replaceAll('-', '').slice(0, 8);
const promoter = randomUUID();
const owner = randomUUID();
const brand = randomUUID();
const link = randomUUID();
const visitor = randomUUID();
const click = randomUUID();
const earning = randomUUID();
const email = `settle-${tag}@promoter.invalid`;
const slug = `settle-${tag}`;
const code = randomUUID().replaceAll('-', '').slice(0, 8);

function check(ok: unknown, message: string) {
  if (!ok) throw new Error(`FAIL: ${message}`);
}

async function main() {
  await pool.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [promoter, email, owner, `owner-${tag}@brand.invalid`]);
  await pool.query(`insert into public.brands (id, slug, name, url, owner_id, status, rate_cents) values ($1, $2, 'Settlement concurrency', $3, $4, 'active', 10)`, [brand, slug, `https://brand-${tag}.invalid`, owner]);
  await pool.query(`insert into public.links (id, code, promoter_id, brand_id, channel) values ($1, $2, $3, $4, 'link')`, [link, code, promoter, brand]);
  await pool.query(`insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
    values ($1, $2, $3, $4, now() - interval '2 hours', $5, $6, 12000)`, [visitor, brand, link, promoter, `ip-${tag}`, `fp-${tag}`]);
  await pool.query(`insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
    values ($1, $2, $3, $4, $5, $6, $7, 'IN')`, [click, link, brand, promoter, visitor, `ip-${tag}`, `ua-${tag}`]);
  await pool.query(`insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status)
    values ($1, $2, $3, $4, $5, $6, 100, now() - interval '1 second', now() - interval '1 day', 'pending')`, [earning, promoter, brand, link, visitor, click]);

  const [{ rows: first }, { rows: second }] = await Promise.all([
    pool.query(`select public.settle_due_earnings() as result`),
    pool.query(`select public.settle_due_earnings() as result`),
  ]);
  const ledger = await pool.query(`select count(*)::int as n from public.promoter_ledger where earning_id = $1 and reason = 'earning'`, [earning]);
  const row = await pool.query(`select status, settled_at from public.earnings where id = $1`, [earning]);
  const trust = await pool.query(`select trust_score from public.profiles where id = $1`, [promoter]);
  check(row.rows[0]?.status === 'available' && row.rows[0]?.settled_at, 'earning settles once');
  check(ledger.rows[0]?.n === 1, 'concurrent workers create one ledger credit');
  check(trust.rows[0]?.trust_score === 1, 'concurrent workers award one clean-cycle trust point');
  check(first[0]?.result && second[0]?.result, 'both worker calls complete');
  console.log('ok: settlement integration (concurrent workers, ledger and trust idempotency)');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.query(`delete from public.notification_outbox where recipient_user_id = any($1::uuid[])`, [[promoter, owner]]).catch(() => {});
    await pool.query(`delete from public.fraud_flags where subject_id = $1`, [earning]).catch(() => {});
    await pool.query(`delete from public.promoter_ledger where earning_id = $1`, [earning]).catch(() => {});
    await pool.query(`delete from public.fraud_assessments where link_id = $1`, [link]).catch(() => {});
    await pool.query(`delete from public.earnings where id = $1`, [earning]).catch(() => {});
    await pool.query(`delete from public.clicks where id = $1`, [click]).catch(() => {});
    await pool.query(`delete from public.visitors where id = $1`, [visitor]).catch(() => {});
    await pool.query(`delete from public.links where id = $1`, [link]).catch(() => {});
    await pool.query(`delete from public.brands where id = $1`, [brand]).catch(() => {});
    await pool.query(`delete from auth.users where id = any($1::uuid[])`, [[promoter, owner]]).catch(() => {});
    await pool.end();
  });
