// Worker config. Fails fast on missing required values.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const environment = process.env.APP_ENV ?? 'local';
const paymentsMode = process.env.PAYMENTS_MODE === 'mock' ? 'mock' : 'razorpay';
if (paymentsMode === 'mock' && environment !== 'local') {
  throw new Error('PAYMENTS_MODE=mock is only allowed when APP_ENV=local');
}

export const env = {
  // Direct Postgres connection (session mode). pg-boss does not work through
  // Supabase's transaction-mode pooler.
  databaseUrl: required('DATABASE_URL'),
  sentryDsn: process.env.WORKER_SENTRY_DSN,
  environment,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',

  // Email: Resend in real environments; the local Mailpit inbox in development.
  emailFrom: process.env.EMAIL_FROM ?? 'brandbid <noreply@brandbid.wtf>',
  resendApiKey: process.env.RESEND_API_KEY,
  mailpitUrl: process.env.MAILPIT_URL ?? (environment === 'local' ? 'http://127.0.0.1:54324' : undefined),

  // Payments (refunds for rejected listings).
  paymentsMode,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
};
