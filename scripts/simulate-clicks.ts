import { randomBytes } from 'node:crypto';
import { connectLocalDatabase } from '../packages/db/scripts/local-db';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const TEST_TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function localHost(host: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(host.replace(/^\[|\]$/g, ''));
}

function simulatorConfig() {
  const baseUrl = new URL(process.env.SIMULATE_BASE_URL ?? 'http://127.0.0.1:3000');
  const local = localHost(baseUrl.hostname);
  const staging = baseUrl.hostname === 'staging.brandbid.wtf';
  if (!local && !staging) throw new Error('Simulator target must be local or https://staging.brandbid.wtf; production is not allowed.');
  if (staging && baseUrl.protocol !== 'https:') throw new Error('The staging simulator target must use HTTPS.');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    throw new Error('SIMULATE_BASE_URL must be an origin without credentials, path, query or fragment.');
  }

  const linkCode = process.env.SIMULATE_LINK_CODE ?? 'demo0001';
  if (!/^[A-Za-z0-9]{8}$/.test(linkCode)) throw new Error('SIMULATE_LINK_CODE must be an 8-character link code.');
  const count = Number(process.env.SIMULATE_COUNT ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('SIMULATE_COUNT must be between 1 and 10.');
  const waitMs = Number(process.env.SIMULATE_WAIT_MS ?? 10_500);
  if (!Number.isInteger(waitMs) || waitMs < 10_000 || waitMs > 180_000) throw new Error('SIMULATE_WAIT_MS must be between 10000 and 180000.');
  return { baseUrl, local, staging, linkCode, count, waitMs, token: process.env.SIMULATE_TURNSTILE_TOKEN ?? TEST_TURNSTILE_TOKEN };
}

async function waitForClick(db: Awaited<ReturnType<typeof connectLocalDatabase>>, clickId: string) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const { rows } = await db.query(`select id, ignored_reason from public.clicks where id = $1`, [clickId]);
    if (rows[0]) return rows[0] as { id: string; ignored_reason: string | null };
    await sleep(200);
  }
  throw new Error(`Timed out waiting for /go to write click ${clickId}. Check the web server and local Supabase connection.`);
}

async function main() {
  const config = simulatorConfig();
  const verificationDb = config.local ? await connectLocalDatabase() : null;
  try {
    for (let index = 0; index < config.count; index++) {
      const cookieId = randomBytes(16).toString('hex');
      const sourceIp = `198.51.100.${index + 1}`;
      const clickResponse = await fetch(new URL(`/go/${config.linkCode}`, config.baseUrl), {
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          'cf-connecting-ip': sourceIp,
          'cf-ipcountry': 'US',
          cookie: `bb_consent=yes; bb_vid=${cookieId}`,
        },
      });
      if (clickResponse.status !== 302) throw new Error(`/go returned ${clickResponse.status}; expected a browser redirect. The link may be inactive or the web server may be unavailable.`);
      const location = clickResponse.headers.get('location');
      if (!location) throw new Error('/go returned a redirect without a destination.');
      const destination = new URL(location, config.baseUrl);
      const clickId = destination.searchParams.get('c');
      if (!clickId) throw new Error('/go redirect did not contain a click ID.');

      if (verificationDb) {
        const click = await waitForClick(verificationDb, clickId);
        if (click.ignored_reason) throw new Error(`Click ${clickId} was ignored as ${click.ignored_reason}. Use a fresh simulator run.`);
      }

      console.log(`[${index + 1}/${config.count}] Recorded click ${clickId}; waiting ${config.waitMs} ms of active time.`);
      await sleep(config.waitMs);
      const qualificationResponse = await fetch(new URL('/api/q', config.baseUrl), {
        method: 'POST',
        headers: {
          origin: config.baseUrl.origin,
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          'cf-connecting-ip': sourceIp,
          'cf-ipcountry': 'US',
          cookie: `bb_consent=yes; bb_vid=${cookieId}`,
        },
        body: JSON.stringify({
          clickId,
          linkCode: config.linkCode,
          activeMs: config.waitMs,
          interactions: 1,
          turnstileToken: config.token,
        }),
      });
      if (qualificationResponse.status !== 204) throw new Error(`/api/q returned ${qualificationResponse.status}; expected 204.`);

      if (verificationDb) {
        const { rows } = await verificationDb.query(`
          select v.qualified_at, e.status
          from public.visitors v
          left join public.earnings e on e.visitor_id = v.id
          where v.qualified_click_id = $1
        `, [clickId]);
        if (!rows[0]?.qualified_at) throw new Error(`/api/q accepted the request but did not qualify click ${clickId}. Check Turnstile, cookies, and the qualification rejection logs.`);
        console.log(`  Qualified visitor; earning status: ${rows[0].status ?? 'not recorded'}.`);
      } else {
        console.log('  /api/q accepted the request (204). Staging database was not queried.');
      }
    }
  } finally {
    await verificationDb?.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
