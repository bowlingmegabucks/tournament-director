import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const databaseUrl = 'mariadb://megabucks:bowling4money@localhost:15306/bowling_megabucks'
// The smallest valid environment. DATABASE_URL has no default (D-33).
const baseEnv = { DATABASE_URL: databaseUrl }

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig(baseEnv)).toEqual({
      port: 3000,
      databaseUrl,
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

  it('fails without DATABASE_URL (D-33)', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment: .*DATABASE_URL/s)
  })

  it.each(['', 'postgres://u:secret@host/db', 'localhost:3306', 'not-mariadb://u:p@host/db'])(
    'rejects DATABASE_URL=%s (D-33)',
    (url) => {
      expect(() => loadConfig({ DATABASE_URL: url })).toThrow(
        /must start with mariadb:\/\/ or mysql:\/\/.*DATABASE_URL/s,
      )
    },
  )

  it('accepts a mysql:// URL', () => {
    const url = 'mysql://u:p@host:3306/db'
    expect(loadConfig({ DATABASE_URL: url }).databaseUrl).toBe(url)
  })

  it('does not print the password when it rejects the URL', () => {
    const rejected = () => loadConfig({ DATABASE_URL: 'postgres://u:secret@host/db' })
    expect(rejected).toThrow(/Invalid environment/)
    expect(rejected).not.toThrow(/secret/)
  })

  it('reads the port as a number', () => {
    expect(loadConfig({ ...baseEnv, PORT: '8080' }).port).toBe(8080)
  })

  it('splits CORS_ORIGIN on commas and trims blanks', () => {
    const config = loadConfig({
      ...baseEnv,
      CORS_ORIGIN: ' https://a.example , https://b.example ,, ',
    })
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('reads the rate limit', () => {
    const config = loadConfig({ ...baseEnv, RATE_LIMIT_MAX: '5', RATE_LIMIT_WINDOW_SECONDS: '10' })
    expect(config.rateLimit).toEqual({ max: 5, windowSeconds: 10 })
  })

  it('reads the number of trusted proxies', () => {
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '1' }).trustProxy).toBe(1)
  })

  it.each([
    ['RATE_LIMIT_MAX', '0'],
    ['RATE_LIMIT_WINDOW_SECONDS', '0'],
    ['TRUST_PROXY', '-1'],
    ['TRUST_PROXY', '6'],
    ['TRUST_PROXY', 'yes'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => loadConfig({ ...baseEnv, [name]: value })).toThrow(/Invalid environment/)
  })

  it('reads the log level', () => {
    expect(loadConfig({ ...baseEnv, LOG_LEVEL: 'debug' }).logLevel).toBe('debug')
  })

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...baseEnv, LOG_LEVEL: 'loud' })).toThrow(/Invalid environment/)
  })

  it.each(['abc', '0', '70000', '1.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ ...baseEnv, PORT: port })).toThrow(/Invalid environment/)
  })

  describe('telemetry', () => {
    it('reads names from the environment', () => {
      const { telemetry } = loadConfig({
        ...baseEnv,
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
        ...baseEnv,
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:15341/ingest/otlp',
        APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
      })
      expect(telemetry.otlpEndpoint).toBe('http://localhost:15341/ingest/otlp')
      expect(telemetry.appInsightsConnectionString).toBe('InstrumentationKey=abc')
    })

    it('treats empty and blank values as not set', () => {
      const { telemetry } = loadConfig({
        ...baseEnv,
        OTEL_EXPORTER_OTLP_ENDPOINT: '',
        APPLICATIONINSIGHTS_CONNECTION_STRING: '   ',
      })
      expect(telemetry.otlpEndpoint).toBeUndefined()
      expect(telemetry.appInsightsConnectionString).toBeUndefined()
    })
  })
})
