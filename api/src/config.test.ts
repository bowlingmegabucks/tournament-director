import { describe, expect, it } from 'vitest'
import { loadConfig, loadDatabaseUrl } from './config.ts'

const databaseUrl = 'mariadb://megabucks:bowling4money@localhost:15306/bowling_megabucks'
const apiKey = 'api_localKey_thisIsForTestingOnly'
const authSecret = 'auth_localSecret_thisIsForTestingOnly'
const authBaseUrl = 'http://localhost:3000'
// The smallest valid environment. These have no default: DATABASE_URL (D-33), API_KEY (D-95), and
// the two sign-in settings (D-98, D-99).
const baseEnv = {
  DATABASE_URL: databaseUrl,
  API_KEY: apiKey,
  AUTH_SECRET: authSecret,
  AUTH_BASE_URL: authBaseUrl,
}

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig(baseEnv)).toEqual({
      port: 3000,
      databaseUrl,
      apiKey,
      auth: { secret: authSecret, baseUrl: authBaseUrl },
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
    expect(() => loadConfig({ ...baseEnv, DATABASE_URL: undefined })).toThrow(
      /Invalid environment: .*DATABASE_URL/s,
    )
  })

  it('fails without API_KEY (D-95)', () => {
    expect(() => loadConfig({ ...baseEnv, API_KEY: undefined })).toThrow(
      /Invalid environment: .*API_KEY/s,
    )
  })

  it.each(['', ' '.repeat(40), 'a'.repeat(31), `  ${'a'.repeat(31)}  `])(
    'rejects API_KEY=%j, under 32 characters once trimmed (D-95)',
    (key) => {
      expect(() => loadConfig({ ...baseEnv, API_KEY: key })).toThrow(
        /must be at least 32 characters.*API_KEY/s,
      )
    },
  )

  it('accepts a 32-character API_KEY and trims it', () => {
    expect(loadConfig({ ...baseEnv, API_KEY: ` ${'a'.repeat(32)} ` }).apiKey).toBe('a'.repeat(32))
  })

  it('does not print the API key when it rejects one', () => {
    const rejected = () => loadConfig({ ...baseEnv, API_KEY: 'short-secret' })
    expect(rejected).toThrow(/Invalid environment/)
    expect(rejected).not.toThrow(/short-secret/)
  })

  it('fails without AUTH_SECRET (D-98)', () => {
    expect(() => loadConfig({ ...baseEnv, AUTH_SECRET: undefined })).toThrow(
      /Invalid environment: .*AUTH_SECRET/s,
    )
  })

  it.each(['', ' '.repeat(40), 'a'.repeat(31), `  ${'a'.repeat(31)}  `])(
    'rejects AUTH_SECRET=%j, under 32 characters once trimmed (D-98)',
    (secret) => {
      expect(() => loadConfig({ ...baseEnv, AUTH_SECRET: secret })).toThrow(
        /must be at least 32 characters.*AUTH_SECRET/s,
      )
    },
  )

  it('accepts a 32-character AUTH_SECRET and trims it', () => {
    const secret = ` ${'b'.repeat(32)} `
    expect(loadConfig({ ...baseEnv, AUTH_SECRET: secret }).auth.secret).toBe('b'.repeat(32))
  })

  it('does not print the auth secret when it rejects one', () => {
    const rejected = () => loadConfig({ ...baseEnv, AUTH_SECRET: 'short-auth-secret' })
    expect(rejected).toThrow(/Invalid environment/)
    expect(rejected).not.toThrow(/short-auth-secret/)
  })

  it('fails without AUTH_BASE_URL (D-98)', () => {
    expect(() => loadConfig({ ...baseEnv, AUTH_BASE_URL: undefined })).toThrow(
      /Invalid environment: .*AUTH_BASE_URL/s,
    )
  })

  it.each([
    'api.example.com',
    'ftp://api.example.com',
    'https://api.example.com/v1',
    'https://api.example.com/?a=1',
    'https://api.example.com/#top',
    '',
  ])('rejects AUTH_BASE_URL=%j: it must be an http(s) address with no path', (url) => {
    expect(() => loadConfig({ ...baseEnv, AUTH_BASE_URL: url })).toThrow(
      /must be an http\(s\) address with no path.*AUTH_BASE_URL/s,
    )
  })

  it.each([
    ['https://api.bowlingmegabucks.com', 'https://api.bowlingmegabucks.com'],
    ['  https://api.bowlingmegabucks.com/  ', 'https://api.bowlingmegabucks.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('reads AUTH_BASE_URL=%j as the origin %j', (url, origin) => {
    expect(loadConfig({ ...baseEnv, AUTH_BASE_URL: url }).auth.baseUrl).toBe(origin)
  })

  it('reads only the database URL for scripts, with no API_KEY needed', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(databaseUrl)
  })

  it('fails the script loader without DATABASE_URL', () => {
    expect(() => loadDatabaseUrl({})).toThrow(/Invalid environment: .*DATABASE_URL/s)
  })

  it.each(['', 'postgres://u:secret@host/db', 'localhost:3306', 'not-mariadb://u:p@host/db'])(
    'rejects DATABASE_URL=%s (D-33)',
    (url) => {
      expect(() => loadConfig({ ...baseEnv, DATABASE_URL: url })).toThrow(
        /must start with mariadb:\/\/ or mysql:\/\/.*DATABASE_URL/s,
      )
    },
  )

  it('accepts a mysql:// URL', () => {
    const url = 'mysql://u:p@host:3306/db'
    expect(loadConfig({ ...baseEnv, DATABASE_URL: url }).databaseUrl).toBe(url)
  })

  it('does not print the password when it rejects the URL', () => {
    const rejected = () => loadConfig({ ...baseEnv, DATABASE_URL: 'postgres://u:secret@host/db' })
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
