import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      logLevel: 'info',
      rateLimit: { max: 100, windowSeconds: 60 },
      trustProxy: 0,
      corsOrigins: [],
      telemetry: {
        serviceName: 'tournament-director-api',
        serviceVersion: 'unknown',
        environment: 'development',
        otlpEndpoint: undefined,
        appInsightsConnectionString: undefined,
      },
    })
  })

  it('reads the port as a number', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080)
  })

  it('splits CORS_ORIGIN on commas and trims blanks', () => {
    const config = loadConfig({ CORS_ORIGIN: ' https://a.example , https://b.example ,, ' })
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('reads the rate limit', () => {
    const config = loadConfig({ RATE_LIMIT_MAX: '5', RATE_LIMIT_WINDOW_SECONDS: '10' })
    expect(config.rateLimit).toEqual({ max: 5, windowSeconds: 10 })
  })

  it('reads the number of trusted proxies', () => {
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1)
  })

  it.each([
    ['RATE_LIMIT_MAX', '0'],
    ['RATE_LIMIT_WINDOW_SECONDS', '0'],
    ['TRUST_PROXY', '-1'],
    ['TRUST_PROXY', '6'],
    ['TRUST_PROXY', 'yes'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(/Invalid environment/)
  })

  it('reads the log level', () => {
    expect(loadConfig({ LOG_LEVEL: 'debug' }).logLevel).toBe('debug')
  })

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/Invalid environment/)
  })

  it.each(['abc', '0', '70000', '1.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/Invalid environment/)
  })

  describe('telemetry', () => {
    it('reads names from the environment', () => {
      const { telemetry } = loadConfig({
        OTEL_SERVICE_NAME: 'my-api',
        npm_package_version: '1.2.3',
        NODE_ENV: 'production',
      })
      expect(telemetry).toMatchObject({
        serviceName: 'my-api',
        serviceVersion: '1.2.3',
        environment: 'production',
      })
    })

    it('reads the OTLP endpoint and the Application Insights connection string', () => {
      const { telemetry } = loadConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:15341/ingest/otlp',
        APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
      })
      expect(telemetry.otlpEndpoint).toBe('http://localhost:15341/ingest/otlp')
      expect(telemetry.appInsightsConnectionString).toBe('InstrumentationKey=abc')
    })

    it('treats empty and blank values as not set', () => {
      const { telemetry } = loadConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: '',
        APPLICATIONINSIGHTS_CONNECTION_STRING: '   ',
      })
      expect(telemetry.otlpEndpoint).toBeUndefined()
      expect(telemetry.appInsightsConnectionString).toBeUndefined()
    })
  })
})
