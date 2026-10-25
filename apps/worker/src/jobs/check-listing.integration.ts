// Integration test for the check-listing and cleanup jobs against the local database (`supabase start`).
// The site probe is faked so this never touches the internet.
import { randomUUID } from 'node:crypto';
import { createPool } from '../db.js';
import { runCheckListing } from './check-listing.js';
import { runCleanup } from './cleanup.js';

const pool = createPool();
const tag = randomUUID().slice(0, 8);
const owner = randomUUID();
const ids: Record<string, string> = {};

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

async function addBrand(key: string, o: { url: string; name?: string; category: string; status?: string; checked?: boolean }) {
  const id = randomUUID();
  ids[key] = id;
  await q(
    `insert into public.brands (id, slug, name, url, description, owner_id, category_id, status, rate_cents, checked_at)
     values ($1, $2, $3, $4, 'A perfectly good description', $5, (select id from public.categories where slug = $6), $7, 10, $8)`,
    [id, `chk-${tag}-${key}`, o.name ?? `Brand ${key}`, o.url, owner, o.category, o.status ?? 'pending_review', o.checked ? new Date() : null],
  );
}
const row = async (key: string) => (await q(`select status, checked_at, review_reason from public.brands where id = $1`, [ids[key]])).rows[0];

async function main() {
  await q(`insert into auth.users (id, email) values ($1, $2)`, [owner, `chk-${tag}@test.dev`]);
  await q(`update public.settings set value = '["bad-site.com"]'::jsonb where key = 'blocked_domains'`);
  await q(`update public.settings set value = '["casino"]'::jsonb where key = 'banned_words'`);

  // Hosts that the fake probe treats as down all contain "down".
  const probe = async (url: string) => ({ ok: !new URL(url).hostname.includes('down') });

  await addBrand('good', { url: 'https://good-site.com/', category: 'saas' });
  await addBrand('crypto', { url: 'https://coins-site.com/', category: 'crypto' });
  await addBrand('blocked', { url: 'https://www.bad-site.com/', category: 'saas' });
  await addBrand('word', { url: 'https://word-site.com/', category: 'saas', name: 'Big Casino' });
  await addBrand('down', { url: 'https://down-site.com/', category: 'saas' });
  await addBrand('multi', { url: 'https://down.bad-site.com/', category: 'finance', name: 'Casino Fund' });
  await addBrand('draft', { url: 'https://draft-site.com/', category: 'saas', status: 'draft' });
  await addBrand('active', { url: 'https://active-site.com/', category: 'saas', status: 'active' });
  await addBrand('seen', { url: 'https://seen-site.com/', category: 'saas', checked: true });

  const r1 = await runCheckListing(pool, { probe }, 50);
  const ours = (await q(`select count(*)::int n from public.brands where slug like $1 and status = 'pending_review' and checked_at is null`, [`chk-${tag}-%`])).rows[0].n;
  check(ours === 0, 'every pending, unchecked brand was processed');
  check(r1.checked >= 6, `expected to check at least our 6 brands, got ${r1.checked}`);

  const good = await row('good');
  check(good.status === 'active' && good.checked_at && good.review_reason === null, 'clean listing goes live');
  const crypto = await row('crypto');
  check(crypto.status === 'pending_review' && crypto.review_reason === 'category_requires_review', `review category is held: ${JSON.stringify(crypto)}`);
  const blocked = await row('blocked');
  check(blocked.status === 'pending_review' && blocked.review_reason === 'blocked_domain', `blocked domain is held (www stripped): ${JSON.stringify(blocked)}`);
  const word = await row('word');
  check(word.status === 'pending_review' && word.review_reason === 'banned_word:casino', `banned word is held: ${JSON.stringify(word)}`);
  const down = await row('down');
  check(down.status === 'pending_review' && down.review_reason === 'url_unreachable', `unreachable site is held: ${JSON.stringify(down)}`);
  const multi = await row('multi');
  check(multi.review_reason === 'blocked_domain,banned_word:casino,url_unreachable,category_requires_review', `all reasons recorded in order: ${multi.review_reason}`);

  check((await row('draft')).status === 'draft' && !(await row('draft')).checked_at, 'drafts are never checked');
  check((await row('active')).status === 'active' && !(await row('active')).checked_at, 'active brands are left alone');
  check((await row('seen')).review_reason === null, 'already-checked brands are not reprocessed');

  const mail = await q(`select dedupe_key from public.notification_outbox where dedupe_key like $1`, [`listing_approved:%`]);
  const mine = mail.rows.map((r) => r.dedupe_key);
  check(mine.includes(`listing_approved:${ids.good}`), 'approved owner is notified');
  check(!mine.includes(`listing_approved:${ids.crypto}`), 'held listings send no approval email');

  const r2 = await runCheckListing(pool, { probe }, 50);
  check(r2.checked === 0 && r2.approved === 0, 'second run finds nothing new (idempotent)');

  // Concurrent workers never check the same brand twice (FOR UPDATE SKIP LOCKED).
  await addBrand('race1', { url: 'https://race-one.com/', category: 'saas' });
  await addBrand('race2', { url: 'https://race-two.com/', category: 'saas' });
  let calls = 0;
  const slow = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 150));
    return { ok: true };
  };
  const [a, b] = await Promise.all([runCheckListing(pool, { probe: slow }, 50), runCheckListing(pool, { probe: slow }, 50)]);
  check(a.checked + b.checked === 2 && calls === 2, `two concurrent workers split the work without duplicates (checked ${a.checked}+${b.checked}, probes ${calls})`);

  // Cleanup runs and is safe on live data.
  const c = await runCleanup(pool, 7);
  check(typeof c.drafts_deleted === 'number', 'cleanup returns counts');
  check((await row('draft')).status === 'draft', 'a fresh draft survives cleanup');

  console.log('ok: check-listing integration (approve / hold / reasons / idempotent / concurrent)');
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const sql of [
      [`update public.settings set value = '[]'::jsonb where key in ('blocked_domains', 'banned_words')`, []],
      [`delete from public.notification_outbox where recipient_user_id = $1`, [owner]],
      [`delete from public.brand_members where user_id = $1`, [owner]],
      [`delete from public.brands where owner_id = $1`, [owner]],
      [`delete from auth.users where id = $1`, [owner]],
    ] as const) {
      await pool.query(sql[0], [...sql[1]]).catch((e) => console.error('cleanup warning:', e.message));
    }
    await pool.end();
  });
