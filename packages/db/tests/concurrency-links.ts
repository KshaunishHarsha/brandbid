// P2.2 concurrency test: concurrent requests for one promoter/brand/channel return one stable link.
// Needs a running local database: `supabase start`.
import { randomUUID } from 'node:crypto';
import { randomCode } from '../../shared/src/codes.js';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CALLS = 25;
const pool = new Pool({ connectionString: url, max: CALLS + 1 });

function fail(message: string): never { throw new Error(`FAIL: ${message}`); }

async function main() {
  const promoterId = randomUUID();
  const ownerId = randomUUID();
  const brandId = randomUUID();
  const tag = promoterId.slice(0, 8);
  const email = `links-concurrency-${tag}@test.dev`;
  let previousAllowlist: unknown;

  try {
    const setting = await pool.query(`select value from public.settings where key='beta_allowlist'`);
    if (!setting.rowCount) fail('beta_allowlist setting is missing');
    previousAllowlist = setting.rows[0].value;
    await pool.query(`update public.settings set value=coalesce(value,'[]'::jsonb) || jsonb_build_array(lower($1)) where key='beta_allowlist'`, [email]);

    await pool.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now())`, [promoterId, email, ownerId, `owner-${tag}@test.dev`]);
    await pool.query(`update public.profiles set handle=$2,promoter_terms_accepted_at=now() where id=$1`, [promoterId, `links${tag}`]);
    await pool.query(
      `insert into public.brands(id,slug,name,url,owner_id,status,rate_cents) values($1,$2,'Links concurrency','https://links.example.test',$3,'active',10)`,
      [brandId, `links-${tag}`, ownerId],
    );

    const outcomes = await Promise.all(Array.from({ length: CALLS }, () =>
      pool.query(`select id,code from public.get_or_create_link($1,$2,'link',$3)`, [promoterId, brandId, randomCode()]),
    ));
    const results = outcomes.map((outcome) => outcome.rows[0] as { id: string; code: string });
    if (results.some((row) => !row?.id || !row?.code)) fail('a concurrent call returned no link');
    const ids = new Set(results.map((row) => row.id));
    const codes = new Set(results.map((row) => row.code));
    if (ids.size !== 1 || codes.size !== 1) fail(`expected one stable link result, got ${ids.size} IDs and ${codes.size} codes`);

    const persisted = await pool.query(
      `select count(*)::int as count,min(id::text) as id,min(code) as code from public.links where promoter_id=$1 and brand_id=$2 and channel='link'`,
      [promoterId, brandId],
    );
    const row = persisted.rows[0] as { count: number; id: string; code: string };
    if (row.count !== 1 || row.id !== results[0]?.id || row.code !== results[0]?.code) fail('the database did not persist the single link returned by all calls');
    console.log(`ok: concurrency-links (${CALLS} parallel calls -> 1 stable link)`);
  } finally {
    try { await pool.query(`delete from public.links where promoter_id=$1 or brand_id=$2`, [promoterId, brandId]); } catch {}
    try { await pool.query(`delete from public.brands where id=$1`, [brandId]); } catch {}
    try { await pool.query(`delete from auth.users where id in ($1,$2)`, [promoterId, ownerId]); } catch {}
    if (previousAllowlist !== undefined) {
      try { await pool.query(`update public.settings set value=$1::jsonb where key='beta_allowlist'`, [JSON.stringify(previousAllowlist)]); } catch (error) { console.error('allowlist cleanup warning:', (error as Error).message); }
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error((error as Error).message ?? error);
  process.exit(1);
});
