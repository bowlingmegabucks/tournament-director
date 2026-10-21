import type { IncomingMessage } from 'node:http'
import type { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { describe, expect, it } from 'vitest'
import { createConfig } from './test/factories.ts'
import {
  createInstrumentations,
  createResource,
  createTelemetryOptions,
  createTelemetrySdk,
  isQuietPath,
  shutdownTelemetry,
  startTelemetry,
} from './telemetry.ts'

const telemetry = createConfig().telemetry

describe('createTelemetrySdk', () => {
  it('returns nothing when no destination is set', () => {
    expect(createTelemetrySdk(telemetry)).toBeUndefined()
  })

  it('returns an SDK when an OTLP endpoint is set', () => {
    const sdk = createTelemetrySdk({
      ...telemetry,
      otlpEndpoint: 'http://localhost:15341/ingest/otlp',
    })
    expect(sdk).toBeDefined()
  })

  it('returns an SDK when an Application Insights connection string is set', () => {
    const sdk = createTelemetrySdk({
      ...telemetry,
      appInsightsConnectionString:
        'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://example.invalid/',
    })
    expect(sdk).toBeDefined()
  })
})

describe('createTelemetryOptions', () => {
  const otlp = { ...telemetry, otlpEndpoint: 'http://localhost:15341/ingest/otlp' }
  const azure = {
    ...telemetry,
    appInsightsConnectionString: 'InstrumentationKey=00000000-0000-0000-0000-000000000000',
  }

  it('sends all three signals to OTLP', () => {
    const options = createTelemetryOptions(otlp)
    expect(options?.spanProcessors).toHaveLength(1)
    expect(options?.metricReaders).toHaveLength(1)
    expect(options?.logRecordProcessors).toHaveLength(1)
  })

  it('sends all three signals to both destinations when both are set', () => {
    const options = createTelemetryOptions({
      ...otlp,
      appInsightsConnectionString: azure.appInsightsConnectionString,
    })
    expect(options?.spanProcessors).toHaveLength(2)
    expect(options?.metricReaders).toHaveLength(2)
    expect(options?.logRecordProcessors).toHaveLength(2)
  })

  it('sends all three signals to Azure Monitor', () => {
    const options = createTelemetryOptions(azure)
    expect(options?.spanProcessors).toHaveLength(1)
    expect(options?.metricReaders).toHaveLength(1)
    expect(options?.logRecordProcessors).toHaveLength(1)
  })

  it('names the service on the resource', () => {
    const options = createTelemetryOptions(otlp)
    expect(options?.resource?.attributes).toMatchObject({
      'service.name': 'test-api',
      'service.version': '0.0.0',
      'deployment.environment.name': 'test',
    })
  })

  it('instruments http and express', () => {
    const names = createInstrumentations().map(
      (instrumentation) => instrumentation.instrumentationName,
    )
    expect(names).toEqual([
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-express',
      '@opentelemetry/instrumentation-pino',
    ])
  })
})

describe('the http instrumentation', () => {
  it('skips health probes', () => {
    const http = createInstrumentations()[0] as HttpInstrumentation
    const skips = (url: string) =>
      http.getConfig().ignoreIncomingRequestHook?.({ url } as IncomingMessage)
    expect(skips('/health')).toBe(true)
    expect(skips('/tournaments')).toBe(false)
  })
})

describe('createResource', () => {
  it('keeps the SDK defaults next to our attributes', () => {
    expect(createResource(telemetry).attributes).toMatchObject({
      'telemetry.sdk.language': 'nodejs',
    })
  })
})

describe('isQuietPath', () => {
  it.each(['/health', '/health?probe=1'])('ignores %s', (url) => {
    expect(isQuietPath(url)).toBe(true)
  })

  it.each(['/tournaments', '/health/deep', '/', undefined])('keeps %s', (url) => {
    expect(isQuietPath(url)).toBe(false)
  })
})

describe('startTelemetry and shutdownTelemetry', () => {
  it('do nothing without a destination', async () => {
    startTelemetry(telemetry)
    await expect(shutdownTelemetry()).resolves.toBeUndefined()
  })
})
