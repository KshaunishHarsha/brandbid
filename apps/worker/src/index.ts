import * as Sentry from '@sentry/node';
import { PgBoss } from 'pg-boss';
import { buildContext } from './context.js';
import { env } from './env.js';
import { createJobHeartbeat } from './heartbeat.js';
import { registerJobs } from './jobs/index.js';

if (env.sentryDsn) {
  Sentry.init({ dsn: env.sentryDsn, environment: env.environment });
}

async function main() {
  const ctx = buildContext();
  const boss = new PgBoss(env.databaseUrl);
  const heartbeat = createJobHeartbeat((kind) => {
    if (kind === 'checkin') {
      if (env.sentryDsn)
        Sentry.captureCheckIn(
          { monitorSlug: `worker-jobs-${env.environment}`, status: 'ok' },
          {
            schedule: { type: 'crontab', value: '* * * * *' },
            checkinMargin: 10,
            timezone: 'Etc/UTC',
          },
        );
    } else {
      console.error('[worker] no real job has run for 10 minutes');
      Sentry.captureMessage('No real worker job has run for 10 minutes', 'error');
    }
  });
  boss.on('error', (err: Error) => {
    console.error('[worker] pg-boss error', err);
    Sentry.captureException(err);
  });

  await boss.start();
  await registerJobs(boss, ctx, heartbeat.jobRan);
  console.log(`[worker] started (${env.environment})`);

  const heartbeatTimer = setInterval(heartbeat.check, 60_000);

  const shutdown = async () => {
    console.log('[worker] shutting down');
    clearInterval(heartbeatTimer);
    await boss.stop({ graceful: true });
    await ctx.pool.end();
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
