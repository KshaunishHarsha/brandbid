import * as Sentry from '@sentry/nextjs';

// Sentry is optional locally: no DSN means no-op.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.APP_ENV ?? 'local', tracesSampleRate: 0 });
}

export const onRequestError = Sentry.captureRequestError;
