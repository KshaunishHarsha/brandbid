import * as Sentry from '@sentry/node';
import { PostHog } from 'posthog-node';
import { PgBoss } from 'pg-boss';
import { buildContext } from './context.js';
import { env } from './env.js';
import { createJobHeartbeat } from './heartbeat.js';
import { registerJobs } from './jobs/index.js';
import { createPostHogWorkerLogger } from './posthog-logs.js';

if (env.sentryDsn) {
  Sentry.init({ dsn: env.sentryDsn, environment: env.environment });
}

const posthog =
  env.posthogProjectToken && env.posthogHost
    ? new PostHog(env.posthogProjectToken, {
        host: env.posthogHost,
        enableExceptionAutocapture: true,
      })
    : undefined;

if (!posthog && env.environment !== 'production') {
  const missingVariable = env.posthogProjectToken ? 'POSTHOG_HOST' : 'POSTHOG_PROJECT_TOKEN';
  console.error(
    new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    ),
  );
}

const posthogLogs = createPostHogWorkerLogger({
  projectToken: env.posthogProjectToken,
  host: env.posthogHost,
  environment: env.environment,
});

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
      posthogLogs?.error('Worker jobs stalled', {
        event: 'worker_jobs_stalled',
        stalled_for_minutes: 10,
      });
    }
  });
  boss.on('error', (err: Error) => {
    console.error('[worker] pg-boss error', err);
    Sentry.captureException(err);
    posthog?.captureException(err);
  });

  await boss.start();
  await registerJobs(boss, ctx, heartbeat.jobRan);
  console.log(`[worker] started (${env.environment})`);
  posthogLogs?.info('Worker started', { event: 'worker_started' });

  const heartbeatTimer = setInterval(heartbeat.check, 60_000);

  const shutdown = async () => {
    console.log('[worker] shutting down');
    posthogLogs?.info('Worker stopping', { event: 'worker_stopping' });
    clearInterval(heartbeatTimer);
    await boss.stop({ graceful: true });
    await ctx.pool.end();
    await posthogLogs?.shutdown();
    await posthog?.shutdown();
    await Sentry.close(2000);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(async (err) => {
  console.error('[worker] fatal', err);
  Sentry.captureException(err);
  posthog?.captureException(err);
  posthogLogs?.error('Worker terminated unexpectedly', { event: 'worker_fatal' });
  await posthogLogs?.shutdown();
  await posthog?.shutdown();
  process.exit(1);
});
