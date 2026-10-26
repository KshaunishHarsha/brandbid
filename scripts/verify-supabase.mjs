#!/usr/bin/env node
// Checks a Supabase project (local or hosted) against what brandbid expects. See DEPLOYMENT.md section 3.
//
//   node scripts/verify-supabase.mjs <project-url> <anon-key>
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-supabase.mjs <project-url> <anon-key>     # adds the deeper checks
//
// The anon key is public (it ships in the website), so passing it on the command line is fine. The service role key
// is a root password: it is read from the environment only, never printed, and never needed for the main checks.
// Exit code 0 = every check passed, 1 = at least one FAIL.
//
// Plain Node (18+), no dependencies, so it runs the same on Windows, macOS and Linux.
import { pathToFileURL } from 'node:url';

const Z = '00000000-0000-0000-0000-000000000000';

/**
 * Every database function that clients must NOT be able to call, with harmless arguments (made-up ids, so a function
 * that IS callable runs, finds nothing, and does nothing: cleanup uses 100 years). Wrong argument NAMES would make the
 * project answer "no such function" whether or not we have permission, so deep mode checks these payloads really work.
 */
export const PROBES = [
  ['record_bid', { p_brand_id: Z, p_payer_id: Z, p_amount_cents: 1, p_processor: 'verify', p_processor_payment_id: 'verify-probe' }],
  ['fund_waitlist', { p_brand_id: Z }],
  ['approve_listing', { p_brand_id: Z, p_admin_id: Z }],
  ['reject_listing', { p_brand_id: Z, p_admin_id: Z, p_reason: 'verify probe' }],
  ['admin_set_category', { p_brand_id: Z, p_category_id: 1, p_admin_id: Z }],
  ['admin_pending_listings', {}],
  ['claim_price', { p_brand_id: null, p_rank: 1 }],
  ['claim_price_ladder', {}],
  ['leaderboard_all_time', {}],
  ['leaderboard_today', {}],
  ['brand_ranks', { p_brand_id: Z }],
  ['brand_budget_summary', { p_brand_id: Z }],
  ['category_counts', {}],
  ['find_user_id_by_email', { p_email: 'verify-probe@invalid.example' }],
  ['cleanup_stale_listings', { p_days: 36500 }],
  ['cycle_end', { p_link_created: '2026-01-01T00:00:00Z', p_at: '2026-01-01T00:00:00Z' }],
  ['is_admin', {}],
  ['is_brand_member', { p_brand_id: Z }],
];

const SENSITIVE_TABLES = [
  'bids', 'budget_ledger', 'earnings', 'promoter_ledger', 'payout_accounts', 'withdrawals', 'clicks', 'visitors',
  'visitor_keys', 'links', 'settings', 'audit_log', 'fraud_flags', 'notification_outbox', 'member_signals', 'profiles',
  'brand_members', 'budget_refunds',
];

/**
 * Run every check. Returns { pass, fail, warn } and writes lines through `log` (default: console.log).
 * `service` is optional and enables the deeper checks.
 */
export async function verifyProject({ url, anon, service = '', log = console.log, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '');
  let pass = 0, fail = 0, warn = 0;
  const ok = (m) => { log(`  PASS  ${m}`); pass++; };
  const bad = (m) => { log(`  FAIL  ${m}`); fail++; };
  const note = (m) => { log(`  WARN  ${m}`); warn++; };
  const info = (m) => log(`  info  ${m}`);

  /** One request. code 0 = could not connect. */
  async function call(key, method, path, body) {
    try {
      const res = await fetchImpl(base + path, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }
      return { code: res.status, text, json };
    } catch {
      return { code: 0, text: '', json: undefined };
    }
  }
  const errCode = (r) => (r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? (r.json.code ?? '') : '');

  log(`Checking ${base}`);
  log('');
  log('Reachability');
  // (The API root "/rest/v1/" lists the schema and is hidden from the anon key on hosted projects, so probe a public table.)
  let r = await call(anon, 'GET', '/rest/v1/categories?select=slug&limit=1');
  if (r.code === 0) {
    bad('cannot reach the project (wrong URL, or no internet)');
    log(''); log('0 checks possible.');
    return { pass, fail, warn };
  }
  if (r.code === 200) ok('the API answers');
  else if (r.code === 401 || r.code === 403) bad(`the API refused the anon key (HTTP ${r.code}): is it the right key for this project?`);
  else bad(`the API answered HTTP ${r.code}`);

  log('');
  log('Migrations applied and public data readable (anon key)');
  r = await call(anon, 'GET', '/rest/v1/categories?select=slug,requires_review');
  const n = Array.isArray(r.json) ? r.json.length : -1;
  const review = Array.isArray(r.json) ? r.json.filter((c) => c.requires_review).length : -1;
  if (r.code === 200 && n === 19) ok('19 categories are seeded');
  else bad(`expected 19 seeded categories, got '${n}' (HTTP ${r.code}). Did the database push run?`);
  if (review === 4) ok('4 categories need manual review (crypto, finance, health, gambling-adjacent)');
  else bad(`expected 4 review categories, got '${review}'`);
  r = await call(anon, 'GET', '/rest/v1/brands?select=slug&limit=1');
  r.code === 200 ? ok('live brands are publicly readable') : bad(`brands should be readable by anyone (HTTP ${r.code})`);
  r = await call(anon, 'GET', '/rest/v1/public_profiles?select=handle&limit=1');
  r.code === 200 ? ok('public_profiles view works') : bad(`public_profiles view missing or blocked (HTTP ${r.code})`);

  log('');
  log('Outsiders are locked out of everything sensitive (anon key)');
  for (const t of SENSITIVE_TABLES) {
    r = await call(anon, 'GET', `/rest/v1/${t}?select=*&limit=1`);
    if (r.code === 401 || r.code === 403) ok(`table ${t} refuses anonymous reads`);
    else if (r.code === 200) {
      r.text.trim() === '[]'
        ? note(`table ${t} answers anonymous reads with no rows (row-level security filters it; fine if intended, but expected a refusal)`)
        : bad(`table ${t} LEAKS rows to anonymous users`);
    } else bad(`table ${t} gave unexpected HTTP ${r.code} to an anonymous read`);
  }
  for (const t of ['brands', 'categories', 'bids', 'settings']) {
    r = await call(anon, 'POST', `/rest/v1/${t}`, {});
    r.code === 401 || r.code === 403 ? ok(`table ${t} refuses anonymous writes`) : bad(`table ${t} answered an anonymous write with HTTP ${r.code} (must be refused)`);
  }
  for (const [fn, args] of PROBES) {
    r = await call(anon, 'POST', `/rest/v1/rpc/${fn}`, args);
    const c = errCode(r);
    if (r.code === 401 || r.code === 403) ok(`function ${fn} refuses anonymous callers`);
    else if (r.code === 404) ok(`function ${fn} is not visible to anonymous callers`);
    else if ([200, 201, 204].includes(r.code)) bad(`function ${fn} is CALLABLE by anonymous users and ran (money/admin functions must not be)`);
    else if (r.code === 400) c === 'P0001' ? bad(`function ${fn} is CALLABLE by anonymous users (it ran and raised its own error)`) : ok(`function ${fn} was refused (HTTP 400 ${c})`);
    else bad(`function ${fn} gave an unexpected HTTP ${r.code} to an anonymous caller`);
  }

  log('');
  log('Sign-in settings');
  r = await call(anon, 'GET', '/auth/v1/settings');
  if (r.code === 200 && r.json) {
    r.json.external?.email === true ? ok('email sign-in is enabled') : bad('email sign-in is disabled (Authentication > Providers > Email)');
    r.json.mailer_autoconfirm === false
      ? ok('email addresses must be confirmed (mailer_autoconfirm is off)')
      : bad('mailer_autoconfirm is ON: accounts would skip email verification (Authentication > Providers > Email > Confirm email)');
    r.json.external?.google === true ? info('Google sign-in is enabled') : info('Google sign-in is not enabled (fine until the OAuth client exists)');
  } else bad(`could not read the auth settings (HTTP ${r.code})`);

  log('');
  log('Logo storage');
  r = await call(anon, 'GET', '/storage/v1/object/public/logos/__brandbid_probe__.png');
  const msg = `${r.json?.message ?? ''} ${r.json?.error ?? ''}`;
  if (/bucket not found/i.test(msg)) bad("the 'logos' bucket does not exist (it is created by the last database migration: run the database push again)");
  else if (/not found/i.test(msg)) ok("the public 'logos' bucket exists");
  else if (r.code === 404 || r.code === 400) ok(`the public 'logos' bucket answers like a public bucket (HTTP ${r.code})`);
  else bad(`unexpected answer from the logos bucket (HTTP ${r.code}: ${msg.trim()})`);

  if (service) {
    log('');
    log('Deeper checks (service role key from the environment)');
    r = await call(service, 'GET', '/rest/v1/settings?select=key,value');
    if (r.code === 200 && Array.isArray(r.json)) {
      const val = (k) => { const s = r.json.find((x) => x.key === k); return s === undefined ? '' : String(s.value); };
      val('floor_cents') === '10' ? ok('settings: floor is 10 cents') : bad(`settings: floor_cents is '${val('floor_cents')}', expected 10`);
      val('min_bid_cents') === '1000' ? ok('settings: minimum bid is 1000 cents') : bad(`settings: min_bid_cents is '${val('min_bid_cents')}', expected 1000`);
      val('budget_share_bps') === '5000' ? ok('settings: 50% of each bid becomes ad budget') : bad(`settings: budget_share_bps is '${val('budget_share_bps')}', expected 5000`);
      val('rank_step_cents') !== '' ? ok('settings: rank_step_cents present (latest migrations applied)') : bad('settings: rank_step_cents missing (migration 000800 not applied)');
    } else bad(`could not read settings with the service role key (HTTP ${r.code}). Wrong key?`);

    let badProbes = 0;
    for (const [fn, args] of PROBES) {
      r = await call(service, 'POST', `/rest/v1/rpc/${fn}`, args);
      const c = errCode(r);
      if (r.code === 200 || r.code === 204 || (r.code === 400 && c === 'P0001')) continue;
      badProbes++;
      bad(`function ${fn} is missing or its probe is out of date (service role got HTTP ${r.code} ${c}): migrations incomplete?`);
    }
    if (badProbes === 0) ok(`all ${PROBES.length} protected functions exist, and the probes above really exercise them`);

    r = await call(service, 'GET', '/storage/v1/bucket');
    const bucket = Array.isArray(r.json) ? r.json.find((x) => x.name === 'logos') : undefined;
    const state = bucket ? `${bucket.public ? 'public' : 'PRIVATE'}:${bucket.file_size_limit}` : 'missing';
    if (state === 'public:1048576') ok('bucket logos is public with a 1 MB limit');
    else if (state === 'missing') bad('bucket logos is missing');
    else bad(`bucket logos is configured as '${state}', expected 'public:1048576'`);
  } else {
    log('');
    info('Skipping the deeper checks. To include them set SUPABASE_SERVICE_ROLE_KEY in the environment (never on the command line).');
  }

  log('');
  log(`Result: ${pass} passed, ${fail} failed, ${warn} warning(s)`);
  log(fail === 0 ? 'All good.' : 'Fix the FAIL lines above and run this again.');
  return { pass, fail, warn };
}

// Run directly: node scripts/verify-supabase.mjs <url> <anon-key>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [url, anon] = process.argv.slice(2);
  if (!url || !anon) {
    console.error('Usage: node scripts/verify-supabase.mjs <project-url> <anon-key>');
    process.exit(2);
  }
  const { fail } = await verifyProject({ url, anon, service: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' });
  process.exit(fail === 0 ? 0 : 1);
}
