import { SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

type LogAttributes = Record<string, string | number | boolean>;

export type PostHogWorkerLogger = {
  info: (body: string, attributes: LogAttributes) => void;
  error: (body: string, attributes: LogAttributes) => void;
  shutdown: () => Promise<void>;
};

export function createPostHogWorkerLogger(config: {
  projectToken?: string;
  host?: string;
  environment: string;
}): PostHogWorkerLogger | undefined {
  if (!config.projectToken || !config.host) return undefined;

  const provider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'brandbid-worker',
      'deployment.environment': config.environment,
    }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${config.host}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${config.projectToken}`,
            'Content-Type': 'application/json',
          },
        }),
      }),
    ],
  });
  const logger = provider.getLogger('brandbid-worker-posthog');

  return {
    info: (body, attributes) =>
      logger.emit({ body, severityNumber: SeverityNumber.INFO, attributes }),
    error: (body, attributes) =>
      logger.emit({ body, severityNumber: SeverityNumber.ERROR, attributes }),
    shutdown: () => provider.shutdown(),
  };
}
