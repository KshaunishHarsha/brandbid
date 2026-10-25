// Worker config. Fails fast on missing required values (outside tests).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  // Direct Postgres connection (session mode). pg-boss does not work through
  // Supabase's transaction-mode pooler.
  databaseUrl: required('DATABASE_URL'),
  sentryDsn: process.env.WORKER_SENTRY_DSN,
  environment: process.env.APP_ENV ?? 'local',
};
