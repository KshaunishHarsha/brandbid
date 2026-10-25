import * as Sentry from '@sentry/node';
import { PgBoss } from 'pg-boss';
import { createPool } from './db.js';
import { env } from './env.js';
import { registerJobs } from './jobs/index.js';

if (env.sentryDsn) {
  Sentry.init({ dsn: env.sentryDsn, environment: env.environment });
}

async function main() {
  const pool = createPool();
  const boss = new PgBoss(env.databaseUrl);
  boss.on('error', (err: Error) => {
    console.error('[worker] pg-boss error', err);
    Sentry.captureException(err);
  });

  await boss.start();
  await registerJobs(boss, pool);
  console.log(`[worker] started (${env.environment})`);

  // Heartbeat so a silent worker is visible in logs and alerts (P1.11).
  setInterval(() => console.log(`[worker] heartbeat ${new Date().toISOString()}`), 60_000);

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await boss.stop({ graceful: true });
    await pool.end();
    await Sentry.close(2000);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  Sentry.captureException(err);
  process.exit(1);
});
