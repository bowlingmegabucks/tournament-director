import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import type { Instrumentation } from '@opentelemetry/instrumentation'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { defaultResource, resourceFromAttributes, type Resource } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, type LogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader, type IMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions/incubating'
import {
  AzureMonitorLogExporter,
  AzureMonitorMetricExporter,
  AzureMonitorTraceExporter,
} from '@azure/monitor-opentelemetry-exporter'
import type { TelemetryConfig } from './config.ts'

const quietPath = '/health'

/** Health probes run every few seconds and would drown out real traffic. */
export function isQuietPath(url: string | undefined): boolean {
  return url?.split('?')[0] === quietPath
}

export function createResource(config: TelemetryConfig): Resource {
  return defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
    }),
  )
}

export function createInstrumentations(): Instrumentation[] {
  return [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => isQuietPath(request.url),
    }),
    new ExpressInstrumentation(),
    // Adds trace_id and span_id to each log line and sends the line to the OTel log pipeline.
    new PinoInstrumentation(),
    // Event loop delay and use, garbage collection, and heap size. 100 ms keeps the sampling cheap.
    new RuntimeNodeInstrumentation({ monitoringPrecision: 100 }),
  ]
}

/**
 * Describe the SDK, or return `undefined` when no destination is set. Each destination gets all
 * three signals (traces, metrics, logs). Without a destination nothing runs, so tests and a
 * production site without Application Insights make no export attempts.
 */
export function createTelemetryOptions(
  config: TelemetryConfig,
): Partial<NodeSDKConfiguration> | undefined {
  const spanProcessors: SpanProcessor[] = []
  const metricReaders: IMetricReader[] = []
  const logRecordProcessors: LogRecordProcessor[] = []

  if (config.otlpEndpoint !== undefined) {
    // With no explicit url, each exporter reads OTEL_EXPORTER_OTLP_ENDPOINT and
    // OTEL_EXPORTER_OTLP_HEADERS and adds its own /v1/<signal> path.
    spanProcessors.push(new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }))
    metricReaders.push(new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }))
    logRecordProcessors.push(new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }))
  }

  if (config.appInsightsConnectionString !== undefined) {
    const options = { connectionString: config.appInsightsConnectionString }
    spanProcessors.push(
      new BatchSpanProcessor({ exporter: new AzureMonitorTraceExporter(options) }),
    )
    metricReaders.push(
      new PeriodicExportingMetricReader({ exporter: new AzureMonitorMetricExporter(options) }),
    )
    logRecordProcessors.push(
      new BatchLogRecordProcessor({ exporter: new AzureMonitorLogExporter(options) }),
    )
  }

  if (spanProcessors.length === 0) return undefined

  return {
    resource: createResource(config),
    spanProcessors,
    metricReaders,
    logRecordProcessors,
    instrumentations: createInstrumentations(),
  }
}

export function createTelemetrySdk(config: TelemetryConfig): NodeSDK | undefined {
  const options = createTelemetryOptions(config)
  return options && new NodeSDK(options)
}

let running: NodeSDK | undefined

/**
 * Call before the app loads (see instrumentation.ts). Does nothing when no destination is set.
 * A second call stops the SDK that is already running first.
 */
export function startTelemetry(config: TelemetryConfig): void {
  const previous = running
  running = undefined
  void previous?.shutdown()
  const sdk = createTelemetrySdk(config)
  sdk?.start()
  // Set only after start succeeds, so a failed start leaves nothing for shutdownTelemetry to stop.
  running = sdk
}

/** Send what is still buffered, then stop. Safe to call when telemetry never started. */
export async function shutdownTelemetry(): Promise<void> {
  const sdk = running
  running = undefined
  await sdk?.shutdown()
}
