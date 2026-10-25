// Concurrency test for record_bid (BUILD s5 "Concurrency"; s7 rules 2, 4, 8).
// 20 distinct payments, each delivered 5 times IN PARALLEL over separate connections (a webhook retry storm).
// Proves: one bid per payment id, totals and ledger exact, budget never wrong.
// Needs a running local database: `supabase start`.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new Pool({ connectionString: url, max: 25 });

const PAYMENTS = 20;
const DELIVERIES = 5;

function fail(msg: string): never {
  throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const userId = randomUUID();
  const brandId = randomUUID();
  const tag = brandId.slice(0, 8);

  await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, `conc-${tag}@test.dev`]);
  await pool.query(
    `insert into public.brands (id, slug, name, url, owner_id, rate_cents) values ($1, $2, 'Conc', 'https://c.example', $3, 10)`,
    [brandId, `conc-${tag}`, userId],
  );

  try {
    const amounts = Array.from({ length: PAYMENTS }, (_, i) => 1000 + i * 7 + (i % 2)); // odd and even cents
    const calls: Promise<boolean>[] = [];
    for (let i = 0; i < PAYMENTS; i++) {
      for (let d = 0; d < DELIVERIES; d++) {
        calls.push(
          pool
            .query(`select public.record_bid($1, $2, $3, 'razorpay', $4) as r`, [brandId, userId, amounts[i], `pay_${tag}_${i}`])
            .then((res) => res.rows[0].r.created as boolean),
        );
      }
    }
    const created = (await Promise.all(calls)).filter(Boolean).length;
    if (created !== PAYMENTS) fail(`expected ${PAYMENTS} created results, got ${created}`);

    const bids = (await pool.query(`select count(*)::int n from public.bids where brand_id = $1`, [brandId])).rows[0].n;
    if (bids !== PAYMENTS) fail(`expected ${PAYMENTS} bids, got ${bids}`);

    const total = amounts.reduce((a, b) => a + b, 0);
    const budget = amounts.reduce((a, b) => a + Math.floor(b / 2), 0);
    const b = (await pool.query(`select total_paid_cents::int t, budget_cents::int b from public.brands where id = $1`, [brandId])).rows[0];
    if (b.t !== total) fail(`total_paid ${b.t} != ${total}`);
    if (b.b !== budget) fail(`budget ${b.b} != ${budget}`);

    const ledger = (await pool.query(`select coalesce(sum(delta_cents),0)::int s from public.budget_ledger where brand_id = $1`, [brandId])).rows[0].s;
    if (ledger !== budget) fail(`ledger ${ledger} != budget ${budget}`);

    const bad = (await pool.query(`select count(*)::int n from public.bids where brand_id = $1 and revenue_cents + budget_cents <> amount_cents`, [brandId])).rows[0].n;
    if (bad) fail(`${bad} bids do not split exactly`);

    console.log(`ok: concurrency-record-bid (${PAYMENTS * DELIVERIES} parallel calls -> ${bids} bids, total ${total}c, budget ${budget}c)`);
  } finally {
    // Best-effort cleanup that must never mask the real failure.
    const cleanup = [
      [`delete from public.budget_ledger where brand_id = $1`, [brandId]],
      [`delete from public.notification_outbox where payload->>'by_brand_id' = $1`, [brandId]],
      [`delete from public.bids where brand_id = $1`, [brandId]],
      [`delete from public.brands where id = $1`, [brandId]],
      [`delete from auth.users where id = $1`, [userId]],
    ] as const;
    for (const [sql, params] of cleanup) {
      try {
        await pool.query(sql, [...params]);
      } catch (err) {
        console.error('cleanup warning:', (err as Error).message);
      }
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
