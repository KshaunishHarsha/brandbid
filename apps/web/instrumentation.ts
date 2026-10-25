import * as Sentry from '@sentry/nextjs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const posthogLogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogLogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export const posthogLogProvider =
  posthogLogKey && posthogLogHost
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          'service.name': 'brandbid-web',
          'deployment.environment': process.env.APP_ENV ?? 'local',
        }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: `${posthogLogHost}/i/v1/logs`,
              headers: {
                Authorization: `Bearer ${posthogLogKey}`,
                'Content-Type': 'application/json',
              },
            }),
          }),
        ],
      })
    : undefined;

const posthogServerLogger = posthogLogProvider?.getLogger('brandbid-web-posthog');

type LogAttributes = Record<string, string | number | boolean>;

export function logPostHogServerInfo(body: string, attributes: LogAttributes): void {
  posthogServerLogger?.emit({ body, severityNumber: SeverityNumber.INFO, attributes });
}

export async function flushPostHogServerLogs(): Promise<void> {
  await posthogLogProvider?.forceFlush();
}

// Sentry is optional locally: no DSN means no-op.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && !posthogLogProvider && process.env.NODE_ENV !== 'production') {
    const missingVariable = posthogLogKey ? 'NEXT_PUBLIC_POSTHOG_HOST' : 'NEXT_PUBLIC_POSTHOG_KEY';
    console.error(
      new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      ),
    );
  }

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) Sentry.init({ dsn, environment: process.env.APP_ENV ?? 'local', tracesSampleRate: 0 });
}

export const onRequestError = Sentry.captureRequestError;
