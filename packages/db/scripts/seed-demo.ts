import { createHash, randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectLocalDatabase } from './local-db';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const PROMOTER_IDS = ['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];
const BRAND_ID = '20000000-0000-4000-8000-000000000001';
const BID_ID = '30000000-0000-4000-8000-000000000001';
const CHANNELS = ['story', 'linkedin', 'x', 'link'] as const;
const USERS = [
  { id: OWNER_ID, email: 'demo-owner@brandbid.test', handle: 'demo_brand_owner', country: 'IN', role: 'owner' },
  { id: PROMOTER_IDS[0]!, email: 'demo-promoter-one@brandbid.test', handle: 'demo_promoter_one', country: 'IN', role: 'promoter' },
  { id: PROMOTER_IDS[1]!, email: 'demo-promoter-two@brandbid.test', handle: 'demo_promoter_two', country: 'US', role: 'promoter' },
];
const DAY = 24 * 60 * 60 * 1000;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const COUNTRY = ['IN', 'US', 'GB', 'CA', 'DE', null] as const;

type Row = unknown[];
async function insertRows(db: Client, table: string, columns: string[], rows: Row[]) {
  if (rows.length === 0) return;
  const values = rows.flat();
  const tuples = rows.map((_, rowIndex) => {
    const placeholders = columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    return `(${placeholders.join(', ')})`;
  });
  await db.query(`insert into public.${table} (${columns.join(', ')}) values ${tuples.join(', ')}`, values);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function cycleEnd(linkCreatedAt: Date, at: Date, hours: number) {
  const cycleMs = hours * 60 * 60 * 1000;
  const cycles = Math.floor((at.getTime() - linkCreatedAt.getTime()) / cycleMs) + 1;
  return new Date(linkCreatedAt.getTime() + cycles * cycleMs);
}

async function clearDemoFixture(db: Client) {
  await db.query(`delete from public.promoter_ledger where promoter_id = any($1::uuid[])`, [PROMOTER_IDS]);
  await db.query(`delete from public.notification_outbox where payload->>'brand_id' = $1`, [BRAND_ID]);
  await db.query(`delete from public.budget_ledger where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.earnings where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.clicks where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.visitor_keys where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.visitors where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.links where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.brand_members where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.bids where brand_id = $1`, [BRAND_ID]);
  await db.query(`delete from public.brands where id = $1`, [BRAND_ID]);
}

async function main() {
  const db = await connectLocalDatabase();
  try {
    await db.query('begin');
    await clearDemoFixture(db);

    for (const user of USERS) {
      await db.query(`insert into auth.users (id, email, email_confirmed_at)
        values ($1, $2, now()) on conflict (id) do nothing`, [user.id, user.email]);
      await db.query(`update public.profiles set handle = $2, country = $3, status = 'active',
        promoter_terms_accepted_at = case when $4 = 'promoter' then now() else promoter_terms_accepted_at end
        where id = $1`, [user.id, user.handle, user.country, user.role]);
    }

    const floorRows = (await db.query(`select (value #>> '{}')::int as value from public.settings where key = 'floor_cents'`)).rows;
    const waitlistRows = (await db.query(`select (value #>> '{}')::int as value from public.settings where key = 'waitlist_days'`)).rows;
    const cycleRows = (await db.query(`select (value #>> '{}')::int as value from public.settings where key = 'cycle_hours'`)).rows;
    const claimRows = (await db.query(`select (value #>> '{}')::int as value from public.settings where key = 'claim_days'`)).rows;
    const rateCents = Math.max(25, Number(floorRows[0]?.value ?? 10));
    const waitlistDays = Number(waitlistRows[0]?.value ?? 30);
    const cycleHours = Number(cycleRows[0]?.value ?? 24);
    const claimDays = Number(claimRows[0]?.value ?? 7);
    const initialBudgetCents = rateCents * 800;
    const bidAmountCents = initialBudgetCents * 2;
    const now = new Date();
    const linkCreatedAt = new Date(now.getTime() - 60 * DAY);
    const links = PROMOTER_IDS.flatMap((promoterId, promoterIndex) => CHANNELS.map((channel, channelIndex) => ({
      id: `40000000-0000-4000-8000-${String(promoterIndex * CHANNELS.length + channelIndex + 1).padStart(12, '0')}`,
      code: `demo${String(promoterIndex * CHANNELS.length + channelIndex + 1).padStart(4, '0')}`,
      promoterId, channel, createdAt: linkCreatedAt,
    })));

    const { rows: categoryRows } = await db.query(`select id from public.categories where slug = 'saas'`);
    const brandName = 'Demo Analytics Brand';
    await db.query(`insert into public.brands
      (id, slug, name, url, description, category_id, owner_id, status, total_paid_cents, total_reached_at, budget_cents, rate_cents, ads_enabled, created_at)
      values ($1, 'demo-analytics-brand', $2, 'https://example.com/', 'Seeded brand for local traffic and dashboard development.', $3, $4, 'active', $5, now(), $6, $7, false, now())`,
    [BRAND_ID, brandName, categoryRows[0]?.id ?? null, OWNER_ID, bidAmountCents, initialBudgetCents, rateCents]);
    await db.query(`insert into public.bids
      (id, brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id, status)
      values ($1, $2, $3, $4, $5, $6, 'seed', 'seed-demo-analytics-brand', 'succeeded')`,
    [BID_ID, BRAND_ID, OWNER_ID, bidAmountCents, bidAmountCents - initialBudgetCents, initialBudgetCents]);
    await db.query(`insert into public.brand_members (brand_id, user_id, role) values ($1, $2, 'owner')`, [BRAND_ID, OWNER_ID]);
    await db.query(`insert into public.budget_ledger (brand_id, delta_cents, reason, bid_id) values ($1, $2, 'bid', $3)`, [BRAND_ID, initialBudgetCents, BID_ID]);
    await insertRows(db, 'links', ['id', 'code', 'promoter_id', 'brand_id', 'channel', 'status', 'created_at'], links.map((link) => [link.id, link.code, link.promoterId, BRAND_ID, link.channel, 'active', link.createdAt]));

    const visitorRows: Row[] = [];
    const clickRows: Row[] = [];
    const earningRows: Row[] = [];
    const budgetSpendRows: Row[] = [];
    const promoterLedgerRows: Row[] = [];
    let sequence = 0;
    for (let dayIndex = 0; dayIndex < 30; dayIndex++) {
      const eventDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29 + dayIndex));
      for (let linkIndex = 0; linkIndex < links.length; linkIndex++) {
        const link = links[linkIndex]!;
        const events = 1 + ((dayIndex + linkIndex) % 3);
        for (let eventIndex = 0; eventIndex < events; eventIndex++) {
          sequence++;
          const clickId = randomUUID();
          const visitorId = randomUUID();
          const createdAt = new Date(eventDay.getTime() + 8 * 60 * 60 * 1000 + (linkIndex * 45 + eventIndex * 7) * 60_000);
          const ignoredReason = sequence % 5 === 0 ? 'rate_limited' : null;
          const isQualified = ignoredReason === null && (dayIndex + linkIndex + eventIndex) % 3 !== 0;
          const isWaitlisted = isQualified && (dayIndex + linkIndex + eventIndex) % 17 === 0;
          const qualifiedAt = isQualified ? new Date(createdAt.getTime() + 15_000) : null;
          const country = COUNTRY[(dayIndex + linkIndex + eventIndex) % COUNTRY.length];
          const identity = `${dayIndex}:${linkIndex}:${eventIndex}`;
          const cookie = hash(`seed-cookie:${identity}`).slice(0, 32);
          const ipHash = hash(`seed-ip:${identity}`);
          const uaHash = hash(`seed-ua:${identity}`);
          const outboundAt = ignoredReason === null && sequence % 4 !== 0 ? new Date(createdAt.getTime() + 20_000) : null;
          const expiry = new Date(createdAt.getTime() + claimDays * DAY);
          if (ignoredReason === null) {
            visitorRows.push([
              visitorId, BRAND_ID, link.id, link.promoterId, clickId, rateCents, expiry,
              qualifiedAt, isQualified ? clickId : null, isQualified ? ipHash : null, null, isQualified ? 15_000 : null,
              isQualified ? 1 : null, createdAt,
            ]);
          }
          clickRows.push([
            clickId, link.id, BRAND_ID, link.promoterId, ignoredReason === null ? visitorId : null, ignoredReason === null ? cookie : null,
            ipHash, uaHash, AGENT, country, `https://social.example/${link.channel}`, ignoredReason, outboundAt, createdAt,
          ]);

          if (isQualified && qualifiedAt) {
            const earningId = randomUUID();
            if (isWaitlisted) {
              earningRows.push([earningId, link.promoterId, BRAND_ID, link.id, visitorId, clickId, rateCents, null, 'waitlisted', null, null, qualifiedAt]);
            } else {
              const settledAt = cycleEnd(link.createdAt, qualifiedAt, cycleHours);
              const status = settledAt <= now ? 'available' : 'pending';
              earningRows.push([earningId, link.promoterId, BRAND_ID, link.id, visitorId, clickId, rateCents, settledAt, status, qualifiedAt, status === 'available' ? settledAt : null, qualifiedAt]);
              budgetSpendRows.push([BRAND_ID, -rateCents, 'visitor', earningId]);
              if (status === 'available') promoterLedgerRows.push([link.promoterId, rateCents, 'earning', earningId, settledAt]);
            }
          }
        }
      }
    }

    await insertRows(db, 'visitors', ['id', 'brand_id', 'claim_link_id', 'claim_promoter_id', 'claim_click_id', 'claim_rate_cents', 'claim_expires_at', 'qualified_at', 'qualified_click_id', 'qualified_ip_hash', 'qualified_fp_hash', 'qualified_active_ms', 'qualified_interactions', 'created_at'], visitorRows);
    await insertRows(db, 'clicks', ['id', 'link_id', 'brand_id', 'promoter_id', 'visitor_id', 'cookie_id', 'ip_hash', 'ua_hash', 'user_agent', 'country', 'referrer', 'ignored_reason', 'outbound_at', 'created_at'], clickRows);
    await insertRows(db, 'earnings', ['id', 'promoter_id', 'brand_id', 'link_id', 'visitor_id', 'click_id', 'amount_cents', 'cycle_ends_at', 'status', 'funded_at', 'settled_at', 'created_at'], earningRows);
    await insertRows(db, 'budget_ledger', ['brand_id', 'delta_cents', 'reason', 'earning_id'], budgetSpendRows);
    await insertRows(db, 'promoter_ledger', ['promoter_id', 'delta_cents', 'reason', 'earning_id', 'created_at'], promoterLedgerRows);

    const pendingSpend = budgetSpendRows.reduce((total, row) => total + Math.abs(Number(row[1])), 0);
    const waitlistedCount = earningRows.filter((row) => row[8] === 'waitlisted').length;
    const remaining = initialBudgetCents - pendingSpend;
    await db.query(`update public.brands set budget_cents = $2, ads_enabled = ($3 = 0 and $2 >= rate_cents) where id = $1`, [BRAND_ID, remaining, waitlistedCount]);
    await db.query('commit');

    console.log(`Seeded local demo brand: ${brandName} (/b/demo-analytics-brand)`);
    console.log(`Created ${links.length} share links, ${clickRows.length} clicks, ${visitorRows.filter((row) => row[7] !== null).length} qualified visitors (${waitlistedCount} waitlisted).`);
    console.log(`Sample link: http://localhost:3000/go/${links[0]!.code}`);
    console.log(`Demo sign-in emails: ${USERS.map((user) => user.email).join(', ')}`);
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
