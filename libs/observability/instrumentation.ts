import { useAzureMonitor } from '@azure/monitor-opentelemetry';

/**
 * OpenTelemetry / Azure Monitor bootstrap.
 *
 * ⚠️ This file MUST be imported before anything else in `src/main.ts` (it is the
 * very first import). The Azure Monitor distro patches Node's HTTP/DB libraries
 * on load; importing application code first would miss that instrumentation.
 *
 * Behaviour:
 *  - With `APPLICATIONINSIGHTS_CONNECTION_STRING` set → enables distributed
 *    tracing, metrics and log correlation, exporting to Azure Monitor.
 *  - Without it (e.g. local dev) → a no-op, so nothing extra runs offline.
 *
 * We read `process.env` directly (the Nest config layer isn't available this
 * early). The connection string is consumed automatically by the SDK.
 *
 * If you disable Application Insights via the `init` CLI, this file is replaced
 * with a no-op and the dependency is removed.
 */
const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

if (connectionString) {
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
    samplingRatio: Number(process.env.OTEL_SAMPLING_RATIO ?? 1),
  });

  console.log('📡 Azure Monitor OpenTelemetry enabled.');
}
