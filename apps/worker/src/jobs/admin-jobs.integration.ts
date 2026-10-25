// Integration test for the notify and process-refunds jobs against the local database (`supabase start`).
// Mail sending and the payment processor are fakes, so this never touches the network.
import { randomUUID } from 'node:crypto';
import type { Mail } from '@brandbid/emails';
import type { PaymentProcessor } from '@brandbid/payments';
import { createPool } from '../db.js';
import { runNotify } from './notify.js';
import { runProcessRefunds } from './process-refunds.js';

const pool = createPool();
const tag = randomUUID().slice(0, 8);
const owner = randomUUID();
const admin = randomUUID();
const ownerEmail = `own-${tag}@test.dev`;
const brands: string[] = [];

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A brand that paid once and was then rejected: one bid is left owing a processor refund. */
async function rejectedBid(key: string, cents: number): Promise<{ brandId: string; paymentId: string }> {
  const brandId = randomUUID();
  const paymentId = `pay_${tag}_${key}`;
  brands.push(brandId);
  await q(`insert into public.brands (id, slug, name, url, owner_id, rate_cents) values ($1, $2, $3, 'https://x.example.com', $4, 10)`, [brandId, `adm-${tag}-${key}`, `Brand ${key}`, owner]);
  await q(`select public.record_bid($1, $2, $3, 'razorpay', $4)`, [brandId, owner, cents, paymentId]);
  await q(`select public.reject_listing($1, $2, 'Not a fit')`, [brandId, admin]);
  return { brandId, paymentId };
}
const bid = async (paymentId: string) => (await q(`select refund_ref, refund_attempts, refund_last_error, refund_retry_at from public.bids where processor_payment_id = $1`, [paymentId])).rows[0];

function fakeProcessor(behaviour: (paymentId: string, amount: number) => Promise<string>) {
  const calls: Array<[string, number]> = [];
  const processor = {
    name: 'razorpay',
    async refund(paymentId: string, amount: number) {
      calls.push([paymentId, amount]);
      return behaviour(paymentId, amount);
    },
  } as unknown as PaymentProcessor;
  return { processor, calls };
}

async function main() {
  await q(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [owner, ownerEmail, admin, `adm-${tag}@test.dev`]);

  // ============================================================ notify
  const approvedBrand = randomUUID();
  brands.push(approvedBrand);
  await q(`insert into public.brands (id, slug, name, url, owner_id, rate_cents) values ($1, $2, 'Approved Co', 'https://a.example.com', $3, 10)`, [approvedBrand, `adm-${tag}-ok`, owner]);
  await q(`select public.record_bid($1, $2, 1000, 'razorpay', $3)`, [approvedBrand, owner, `pay_${tag}_ok`]);
  await q(`select public.approve_listing($1, $2)`, [approvedBrand, admin]);
  const rejected = await rejectedBid('rej', 2501);
  await q(`insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key) values ('outbid', $1, '{}', $2)`, [owner, `outbid-${tag}`]);

  const sent: Mail[] = [];
  const ctx = { pool, siteUrl: 'https://brandbid.wtf', send: async (m: Mail) => void sent.push(m) };
  const mine = () => sent.filter((m) => m.to === ownerEmail);

  const r1 = await runNotify(ctx, 100);
  check(r1.sent >= 3, `expected the approval, rejection, and outbid emails to be sent, got ${JSON.stringify(r1)}`);
  check(mine().length === 3, `owner got exactly 3 emails, got ${mine().length}`);
  const approved = mine().find((m) => m.subject === 'Approved Co is live on brandbid');
  const rej = mine().find((m) => m.subject.startsWith("We couldn't list Brand rej"));
  const outbidMail = mine().find((m) => m.subject === 'Your brand was outbid on brandbid');
  check(approved && approved.html.includes(`https://brandbid.wtf/b/adm-${tag}-ok`), 'approval email links to the live page');
  check(rej && rej.html.includes('$25.01') && rej.html.includes('Not a fit'), 'rejection email states the refund and the reason');
  check(outbidMail && outbidMail.html.includes('was outbid'), 'outbid notification is rendered for the recipient');
  const outbid = (await q(`select sent_at, attempts from public.notification_outbox where dedupe_key = $1`, [`outbid-${tag}`])).rows[0];
  check(outbid.sent_at !== null && outbid.attempts === 0, 'outbid notification is sent once');

  const before = sent.length;
  await runNotify(ctx, 100);
  check(sent.length === before, 'a second run sends nothing new');

  // failure -> backoff -> retry
  await q(`insert into public.notification_outbox (kind, recipient_email, payload, dedupe_key) values ('listing_approved', $1, '{"name":"Retry Co","slug":"retry-co"}', $2)`, [`retry-${tag}@test.dev`, `retry-${tag}`]);
  let sendCalls = 0;
  const failing = { ...ctx, send: async () => { sendCalls++; throw new Error('smtp down'); } };
  await runNotify(failing, 100);
  const failed = (await q(`select attempts, last_error, send_after > now() + interval '30 seconds' as backed_off, sent_at from public.notification_outbox where dedupe_key = $1`, [`retry-${tag}`])).rows[0];
  check(failed.attempts === 1 && failed.last_error === 'smtp down' && failed.backed_off && failed.sent_at === null, `a failed send is recorded and backed off: ${JSON.stringify(failed)}`);
  const callsAfterFirstFailure = sendCalls;
  await runNotify(failing, 100);
  check(sendCalls === callsAfterFirstFailure, 'it is not retried before its backoff time');
  await q(`update public.notification_outbox set send_after = now() where dedupe_key = $1`, [`retry-${tag}`]);
  await runNotify(ctx, 100);
  check((await q(`select sent_at from public.notification_outbox where dedupe_key = $1`, [`retry-${tag}`])).rows[0].sent_at !== null, 'it is sent once it is due and the transport works');

  // two workers at once: every email goes out exactly once
  for (let i = 0; i < 6; i++) {
    await q(`insert into public.notification_outbox (kind, recipient_email, payload, dedupe_key) values ('listing_approved', $1, '{"name":"C","slug":"c"}', $2)`, [`c${i}-${tag}@test.dev`, `conc-${tag}-${i}`]);
  }
  const got: string[] = [];
  const slow = { ...ctx, send: async (m: Mail) => { await sleep(80); got.push(m.to); } };
  await Promise.all([runNotify(slow, 100), runNotify(slow, 100)]);
  const concurrent = got.filter((t) => t.endsWith(`-${tag}@test.dev`) && t.startsWith('c'));
  check(concurrent.length === 6 && new Set(concurrent).size === 6, `two concurrent workers send each email once (sent ${concurrent.length}, unique ${new Set(concurrent).size})`);

  // ============================================================ process-refunds
  const owed = await q(`select processor_payment_id, amount_cents from public.bids where brand_id = $1 and status = 'refunded' and refund_ref is null`, [rejected.brandId]);
  check(owed.rows.length === 1, 'the rejected listing owes one refund');

  const ok = fakeProcessor(async (id) => `rfnd_${id}`);
  const p1 = await runProcessRefunds({ pool, processor: ok.processor }, 100);
  check(p1.refunded >= 1, `refund issued, got ${JSON.stringify(p1)}`);
  check(ok.calls.some(([id, amt]) => id === rejected.paymentId && amt === 2501), `refunded the exact amount of the right payment: ${JSON.stringify(ok.calls)}`);
  check((await bid(rejected.paymentId)).refund_ref === `rfnd_${rejected.paymentId}`, 'refund reference stored');
  check((await q(`select count(*)::int n from public.audit_log where action = 'listing_refund_issued' and details->>'payment_id' = $1`, [rejected.paymentId])).rows[0].n === 1, 'refund audited');
  const callsBefore = ok.calls.length;
  await runProcessRefunds({ pool, processor: ok.processor }, 100);
  check(ok.calls.length === callsBefore, 'a refunded bid is never refunded twice');

  // failure -> backoff -> retry
  const flaky = await rejectedBid('flaky', 1500);
  let fails = 0;
  const flakyProc = fakeProcessor(async (id) => { if (id === flaky.paymentId && fails++ === 0) throw new Error('boom'); return `rfnd_${id}`; });
  await runProcessRefunds({ pool, processor: flakyProc.processor }, 100);
  let b = await bid(flaky.paymentId);
  check(b.refund_ref === null && b.refund_attempts === 1 && b.refund_last_error === 'boom' && new Date(b.refund_retry_at) > new Date(), `failure recorded with backoff: ${JSON.stringify(b)}`);
  const flakyCalls = flakyProc.calls.filter(([id]) => id === flaky.paymentId).length;
  await runProcessRefunds({ pool, processor: flakyProc.processor }, 100);
  check(flakyProc.calls.filter(([id]) => id === flaky.paymentId).length === flakyCalls, 'not retried before its backoff time');
  await q(`update public.bids set refund_retry_at = now() where processor_payment_id = $1`, [flaky.paymentId]);
  await runProcessRefunds({ pool, processor: flakyProc.processor }, 100);
  b = await bid(flaky.paymentId);
  check(b.refund_ref === `rfnd_${flaky.paymentId}` && b.refund_last_error === null, 'retried when due, then succeeded and cleared the error');

  // "already refunded" is success, not failure
  const dup = await rejectedBid('dup', 1200);
  const dupProc = fakeProcessor(async (id) => { if (id === dup.paymentId) throw new Error('Razorpay failed: 400 The payment has been fully refunded already'); return `rfnd_${id}`; });
  await runProcessRefunds({ pool, processor: dupProc.processor }, 100);
  b = await bid(dup.paymentId);
  check(b.refund_ref === 'already_refunded' && b.refund_attempts === 0, `already-refunded is treated as done: ${JSON.stringify(b)}`);

  // gives up after the cap, tells an admin once, and stops
  const stuck = await rejectedBid('stuck', 1100);
  await q(`update public.bids set refund_attempts = 9 where processor_payment_id = $1`, [stuck.paymentId]);
  const stuckProc = fakeProcessor(async (id) => { if (id === stuck.paymentId) throw new Error('payment too old to refund'); return `rfnd_${id}`; });
  await runProcessRefunds({ pool, processor: stuckProc.processor }, 100);
  b = await bid(stuck.paymentId);
  check(b.refund_attempts === 10 && b.refund_ref === null, 'attempt cap reached');
  check((await q(`select count(*)::int n from public.audit_log where action = 'listing_refund_failed' and details->>'payment_id' = $1`, [stuck.paymentId])).rows[0].n === 1, 'an admin is told once (audit log)');
  await q(`update public.bids set refund_retry_at = now() - interval '1 hour' where processor_payment_id = $1`, [stuck.paymentId]);
  const stuckCalls = stuckProc.calls.filter(([id]) => id === stuck.paymentId).length;
  await runProcessRefunds({ pool, processor: stuckProc.processor }, 100);
  check(stuckProc.calls.filter(([id]) => id === stuck.paymentId).length === stuckCalls, 'no more attempts after the cap');

  // two workers at once: each refund issued exactly once
  const racers = await Promise.all(['r1', 'r2', 'r3', 'r4'].map((k, i) => rejectedBid(k, 1000 + i)));
  const seen: string[] = [];
  const slowProc = fakeProcessor(async (id) => { await sleep(80); seen.push(id); return `rfnd_${id}`; });
  await Promise.all([runProcessRefunds({ pool, processor: slowProc.processor }, 100), runProcessRefunds({ pool, processor: slowProc.processor }, 100)]);
  const mineSeen = seen.filter((id) => racers.some((r) => r.paymentId === id));
  check(mineSeen.length === 4 && new Set(mineSeen).size === 4, `two concurrent workers refund each payment once (${mineSeen.length} calls, ${new Set(mineSeen).size} unique)`);

  console.log('ok: admin jobs integration (emails, backoff, refunds, already-refunded, attempt cap, concurrency)');
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const ids = brands;
    for (const [sql, params] of [
      [`delete from public.notification_outbox where dedupe_key like $1 or recipient_user_id = $2`, [`%${tag}%`, owner]],
      [`delete from public.audit_log where details::text like $1 or subject_id = any($2::uuid[])`, [`%${tag}%`, ids]],
      [`delete from public.budget_ledger where brand_id = any($1::uuid[])`, [ids]],
      [`delete from public.bids where brand_id = any($1::uuid[])`, [ids]],
      [`delete from public.brand_members where user_id = $1`, [owner]],
      [`delete from public.brands where owner_id = $1`, [owner]],
      [`delete from auth.users where id in ($1, $2)`, [owner, admin]],
    ] as const) {
      await pool.query(sql, [...params]).catch((e) => console.error('cleanup warning:', e.message));
    }
    await pool.end();
  });
