import * as Sentry from '@sentry/nextjs';
import { initAnalytics } from '@/lib/analytics';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'local',
    tracesSampleRate: 0,
  });
}

initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
