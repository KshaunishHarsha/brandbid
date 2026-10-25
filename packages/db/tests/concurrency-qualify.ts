// P2.8 stress test: 1,000 concurrent visitors, with duplicate click retries mixed into the same burst.
// Needs local Supabase: `supabase start && pnpm test:concurrency`.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new Pool({ connectionString: url, max: 64 });
const VISITORS = 1_000;
const RATE = 10;
const STARTING_BUDGET = RATE * 300;

function fail(message: string): never { throw new Error(`FAIL: ${message}`); }

async function insertMany(sqlPrefix: string, columns: number, rows: unknown[][]) {
  const params = rows.flat();
  const values = rows.map((_, row) => `(${Array.from({ length: columns }, (_x, col) => `$${row * columns + col + 1}`).join(',')})`).join(',');
  await pool.query(`${sqlPrefix} values ${values}`, params);
}

async function main() {
  const ownerId = randomUUID();
  const promoterIds = Array.from({ length: 5 }, () => randomUUID());
  const brandId = randomUUID();
  const tag = brandId.slice(0, 8);
  const linkIds = promoterIds.map(() => randomUUID());
  const clickIds = Array.from({ length: VISITORS }, () => randomUUID());
  const visitorIds = Array.from({ length: VISITORS }, () => randomUUID());

  try {
    await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [ownerId, `qual-owner-${tag}@test.dev`]);
    for (const [index, promoterId] of promoterIds.entries()) {
      await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [promoterId, `qual-promoter-${index}-${tag}@test.dev`]);
    }
    await pool.query(
      `insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
       values ($1, $2, 'Qualification Stress', 'https://qual-stress.example', $3, 'active', $4, $5, true)`,
      [brandId, `qual-${tag}`, ownerId, RATE, STARTING_BUDGET],
    );
    await pool.query(`insert into public.budget_ledger (brand_id, delta_cents, reason) values ($1, $2, 'bid')`, [brandId, STARTING_BUDGET]);
    await insertMany(
      `insert into public.links (id, code, promoter_id, brand_id, channel, created_at)`, 6,
      linkIds.map((id, index) => [id, `${tag.slice(0, 6)}${index.toString().padStart(2, '0')}`, promoterIds[index], brandId, 'link', new Date(Date.now() - 86_400_000)]),
    );

    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    await insertMany(
      `insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, claim_click_id, claim_rate_cents, claim_expires_at)`, 7,
      visitorIds.map((id, index) => {
        const promoterIndex = index % promoterIds.length;
        return [id, brandId, linkIds[promoterIndex], promoterIds[promoterIndex], clickIds[index], RATE, expiresAt];
      }),
    );
    const clickAge = new Date(Date.now() - 11_000);
    const signals = clickIds.map((_id, index) => ({ ip: `ip-${tag}-${index}`, ua: `ua-${tag}-${index}` }));
    await insertMany(
      `insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, created_at)`, 8,
      clickIds.map((id, index) => {
        const promoterIndex = index % promoterIds.length;
        return [id, linkIds[promoterIndex], brandId, promoterIds[promoterIndex], visitorIds[index], signals[index].ip, signals[index].ua, clickAge];
      }),
    );

    const calls = clickIds.map(async (clickId, index) => {
      const result = await pool.query(
        `select public.qualify_visitor($1, null, null, $2, $3, 10000, 1) as outcome`,
        [clickId, signals[index].ip, signals[index].ua],
      );
      return result.rows[0].outcome as string;
    });
    for (let index = 0; index < 50; index++) {
      calls.push(pool.query(`select public.qualify_visitor($1, null, null, $2, $3, 10000, 1) as outcome`, [clickIds[index], signals[index].ip, signals[index].ua]).then((result) => result.rows[0].outcome as string));
    }
    const outcomes = await Promise.all(calls);
    const funded = outcomes.filter((outcome) => outcome === 'qualified').length;
    const waitlisted = outcomes.filter((outcome) => outcome === 'waitlisted').length;
    const duplicatesRejected = outcomes.filter((outcome) => outcome === 'rejected:already_qualified').length;
    if (funded !== 300) fail(`expected 300 funded, received ${funded}`);
    if (waitlisted !== 700) fail(`expected 700 waitlisted, received ${waitlisted}`);
    if (duplicatesRejected !== 50) fail(`expected 50 duplicate retries rejected, received ${duplicatesRejected}`);

    const budget = (await pool.query(`select budget_cents from public.brands where id = $1`, [brandId])).rows[0].budget_cents;
    if (Number(budget) !== 0) fail(`expected brand budget 0, received ${budget}`);
    const ledger = (await pool.query(`select coalesce(sum(delta_cents), 0) total from public.budget_ledger where brand_id = $1`, [brandId])).rows[0].total;
    if (Number(ledger) !== 0) fail(`expected ledger total 0, received ${ledger}`);
    const order = (await pool.query(
      `select max(created_at) filter (where status='pending') as last_pending,
              min(created_at) filter (where status='waitlisted') as first_waitlisted,
              count(*) filter (where status='pending')::int pending,
              count(*) filter (where status='waitlisted')::int waitlisted,
              count(distinct visitor_id)::int visitors
         from public.earnings where brand_id = $1`, [brandId],
    )).rows[0];
    if (Number(order.pending) !== 300 || Number(order.waitlisted) !== 700 || Number(order.visitors) !== VISITORS) fail('earnings do not match the one-per-visitor distribution');
    if (new Date(order.last_pending).getTime() > new Date(order.first_waitlisted).getTime()) fail('pending earnings were created after waitlisted earnings');

    const oldest = (await pool.query(
      `select visitor_id from public.earnings where brand_id = $1 and status='waitlisted' order by created_at, id limit 200`, [brandId],
    )).rows.map((row) => row.visitor_id as string);
    await pool.query(`update public.brands set budget_cents = budget_cents + 2000 where id = $1`, [brandId]);
    await pool.query(`insert into public.budget_ledger (brand_id, delta_cents, reason) values ($1, 2000, 'bid')`, [brandId]);
    const fundedWaitlist = (await pool.query(`select public.fund_waitlist($1) as funded`, [brandId])).rows[0].funded as number;
    if (fundedWaitlist !== 200) fail(`expected 200 oldest waitlisted earnings funded, received ${fundedWaitlist}`);
    const newlyFunded = (await pool.query(
      `select visitor_id from public.earnings where brand_id = $1 and status='pending' and visitor_id = any($2::uuid[])`, [brandId, oldest],
    )).rows.map((row) => row.visitor_id as string);
    if (newlyFunded.length !== 200 || oldest.some((id) => !newlyFunded.includes(id))) fail('refill did not fund exactly the 200 oldest waitlisted visitors');
    const remain = (await pool.query(`select count(*)::int n from public.earnings where brand_id = $1 and status='waitlisted'`, [brandId])).rows[0].n;
    if (remain !== 500) fail(`expected 500 waitlisted after refill, received ${remain}`);

    console.log('ok: concurrency-qualify (1,000 distinct visitors + 50 duplicate retries; 300 funded, 700 queued, 200 oldest funded on refill)');
  } finally {
    const cleanup: Array<[string, unknown[]]> = [
      [`delete from public.budget_ledger where brand_id = $1`, [brandId]],
      [`delete from public.notification_outbox where payload->>'brand_id' = $1`, [brandId]],
      [`delete from public.earnings where brand_id = $1`, [brandId]],
      [`delete from public.clicks where brand_id = $1`, [brandId]],
      [`delete from public.visitor_keys where brand_id = $1`, [brandId]],
      [`delete from public.visitors where brand_id = $1`, [brandId]],
      [`delete from public.links where brand_id = $1`, [brandId]],
      [`delete from public.brands where id = $1`, [brandId]],
      [`delete from auth.users where id = any($1::uuid[])`, [[ownerId, ...promoterIds]]],
    ];
    for (const [sql, params] of cleanup) {
      try { await pool.query(sql, params); } catch (error) { console.error('cleanup warning:', (error as Error).message); }
    }
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message ?? error); process.exit(1); });
