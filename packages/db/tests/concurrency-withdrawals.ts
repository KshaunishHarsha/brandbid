// P3.6 concurrency test: many simultaneous withdrawal taps reserve a promoter balance exactly once.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new Pool({ connectionString: url, max: 32 });
const CALLS = 25;
const AMOUNT = 3500;

function fail(message: string): never { throw new Error(`FAIL: ${message}`); }

async function main() {
  const promoterId = randomUUID();
  const tag = promoterId.slice(0, 8);
  try {
    await pool.query('insert into auth.users (id,email) values ($1,$2)', [promoterId, `withdraw-concurrency-${tag}@test.dev`]);
    await pool.query(`update public.profiles set phone_verified_at=now(),kyc_status='verified' where id=$1`, [promoterId]);
    await pool.query(`insert into public.payout_accounts(promoter_id,provider,external_id,verified) values($1,'local-fixture',$2,true)`, [promoterId, `withdraw-${tag}`]);
    await pool.query(`insert into public.promoter_ledger(promoter_id,delta_cents,reason) values($1,$2,'earning')`, [promoterId, AMOUNT]);

    const outcomes = await Promise.all(Array.from({ length: CALLS }, async () => {
      try {
        const result = await pool.query(`select public.request_withdrawal($1) as result`, [promoterId]);
        return { status: 'created', result: result.rows[0].result as { amount_cents: number; status: string } };
      } catch (error) {
        return { status: (error as Error).message };
      }
    }));
    const created = outcomes.filter((item) => item.status === 'created');
    const rejected = outcomes.filter((item) => item.status === 'withdrawal_open');
    if (created.length !== 1 || rejected.length !== CALLS - 1) fail(`expected 1 request and ${CALLS - 1} open-request rejections, got ${created.length} and ${rejected.length}`);
    if (created[0]?.result.amount_cents !== AMOUNT || created[0]?.result.status !== 'review') fail('the first request did not reserve the full amount for review');

    const persisted = await pool.query(`
      select (select count(*)::int from public.withdrawals where promoter_id=$1) as requests,
             (select coalesce(sum(delta_cents),0)::bigint from public.promoter_ledger where promoter_id=$1) as balance,
             (select count(*)::int from public.promoter_ledger where promoter_id=$1 and reason='withdrawal') as debits`, [promoterId]);
    const row = persisted.rows[0] as { requests: number; balance: string; debits: number };
    if (row.requests !== 1 || Number(row.balance) !== 0 || row.debits !== 1) fail('concurrent taps created duplicate requests or ledger reservations');
    console.log(`ok: concurrency-withdrawals (${CALLS} parallel taps -> 1 reviewed request, 1 exact ledger debit)`);
  } finally {
    try { await pool.query('delete from public.promoter_ledger where promoter_id=$1', [promoterId]); } catch {}
    try { await pool.query('delete from public.withdrawals where promoter_id=$1', [promoterId]); } catch {}
    try { await pool.query('delete from public.payout_accounts where promoter_id=$1', [promoterId]); } catch {}
    try { await pool.query('delete from auth.users where id=$1', [promoterId]); } catch {}
    await pool.end();
  }
}

main().catch((error) => {
  console.error((error as Error).message ?? error);
  process.exit(1);
});
