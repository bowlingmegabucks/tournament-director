import { z } from 'zod'

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

// An empty value in .env or App Service settings means "not set".
const optionalText = z
  .string()
  .default('')
  .transform((value) => value.trim() || undefined)

function isOriginUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  const web = url.protocol === 'http:' || url.protocol === 'https:'
  return web && url.pathname === '/' && url.search === '' && url.hash === ''
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // mariadb://USER:PASSWORD@HOST:3306/DATABASE. Required: there is no demo-data fallback (D-33).
  DATABASE_URL: z.string().regex(/^(mariadb|mysql):\/\//, 'must start with mariadb:// or mysql://'),
  // The one key the registration site sends in x-api-key (D-95). Required: no key, no start.
  API_KEY: z.string().trim().min(32, 'must be at least 32 characters'),
  // Signs the sign-in cookie (D-98). Required: no secret, no start. Keep it apart from API_KEY.
  AUTH_SECRET: z.string().trim().min(32, 'must be at least 32 characters'),
  // The API's public address, scheme and host only: https://api.bowlingmegabucks.com. Better Auth
  // builds its cookie and checks the request origin from it, and a https address marks the cookie
  // `Secure`. Required: a missing value would let it guess from the request.
  AUTH_BASE_URL: z
    .string()
    .refine(isOriginUrl, 'must be an http(s) address with no path, such as https://api.example.com')
    .transform((value) => new URL(value).origin),
  // Comma-separated list. Empty means same-origin only.
  CORS_ORIGIN: z.string().default(''),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  // How many reverse proxies sit in front of the API. 0 for local dev, 1 on Azure App Service.
  // Too low and every caller shares the proxy's address; too high and callers can fake theirs.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  OTEL_SERVICE_NAME: z.string().default('tournament-director-api'),
  // Base OTLP URL, for example http://localhost:15341/ingest/otlp (Seq). The exporters add
  // /v1/traces, /v1/metrics, and /v1/logs, and read OTEL_EXPORTER_OTLP_HEADERS themselves.
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalText,
  // Set by Azure when Application Insights is on. Unset means no Azure export.
  APPLICATIONINSIGHTS_CONNECTION_STRING: optionalText,
  // Email, for the invite sent when an admin adds a user. Leave SMTP_HOST empty to turn email off:
  // the create-user route then answers 503 and creates no one. With a host set, the rest are required.
  SMTP_HOST: optionalText,
  // 587 is STARTTLS (SMTP_SECURE false); 465 is TLS from the start (SMTP_SECURE true).
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  // Local only: trust a self-signed certificate (the Mailpit container). Refused in production.
  SMTP_ALLOW_SELF_SIGNED: z.enum(['true', 'false']).default('false'),
  SMTP_USER: optionalText,
  SMTP_PASSWORD: optionalText,
  // The From address: `bowling@example.com` or `Tournament Director <bowling@example.com>`.
  MAIL_FROM: optionalText,
  // Where the web app lives, so an invite can link to it: https://bowlingmegabucks.com/tournament-director
  WEB_BASE_URL: optionalText,
  // Set by npm when it runs a script (`npm start`, `npm run dev`).
  npm_package_version: z.string().default('unknown'),
})

export interface TelemetryConfig {
  serviceName: string
  serviceVersion: string
  environment: string
  /** Send telemetry here over OTLP. `undefined` turns the OTLP export off. */
  otlpEndpoint: string | undefined
  /** Send telemetry to Azure Monitor. `undefined` turns the Azure export off. */
  appInsightsConnectionString: string | undefined
}

export interface AuthConfig {
  /** Signs the session cookie. A secret: never log it. */
  secret: string
  /** The API's own origin, such as `https://api.bowlingmegabucks.com`. */
  baseUrl: string
}

export interface MailConfig {
  host: string
  port: number
  /** `true` is TLS from the start (port 465). `false` upgrades with STARTTLS, which is required. */
  secure: boolean
  /** Trust a self-signed certificate. Local use only: never `true` in production. */
  allowSelfSigned: boolean
  user: string
  /** A secret: never log it. */
  password: string
  from: string
  /** The web app's address with no trailing slash. Invite links start with it. */
  webBaseUrl: string
}

export interface RateLimitConfig {
  /** Requests allowed per client in one window. */
  max: number
  windowSeconds: number
}

export type LogLevel = (typeof logLevels)[number]

export interface Config {
  port: number
  /** Connection string for the legacy MariaDB database. Holds the password: never log it. */
  databaseUrl: string
  /** The key callers send in `x-api-key` (D-95). A secret: never log it. */
  apiKey: string
  auth: AuthConfig
  /** `undefined` when `SMTP_HOST` is empty: the API cannot send email. */
  mail: MailConfig | undefined
  logLevel: LogLevel
  rateLimit: RateLimitConfig
  trustProxy: number
  corsOrigins: string[]
  telemetry: TelemetryConfig
}

function parseEnv<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`)
  }
  return result.data
}

type Env = z.infer<typeof envSchema>

function mailConfigOf(data: Env): MailConfig | undefined {
  if (data.SMTP_HOST === undefined) return undefined
  const { SMTP_USER: user, SMTP_PASSWORD: password, MAIL_FROM: from, WEB_BASE_URL: web } = data
  const missing = [
    ['SMTP_USER', user],
    ['SMTP_PASSWORD', password],
    ['MAIL_FROM', from],
    ['WEB_BASE_URL', web],
  ].filter(([, value]) => value === undefined)
  if (user === undefined || password === undefined || from === undefined || web === undefined) {
    throw new Error(
      `Invalid environment: ${missing.map(([name]) => name).join(', ')} required when SMTP_HOST is set`,
    )
  }
  if (!URL.canParse(web) || !/^https?:$/.test(new URL(web).protocol)) {
    throw new Error('Invalid environment: WEB_BASE_URL must be an http(s) address')
  }
  const allowSelfSigned = data.SMTP_ALLOW_SELF_SIGNED === 'true'
  if (allowSelfSigned && data.NODE_ENV === 'production') {
    throw new Error('Invalid environment: SMTP_ALLOW_SELF_SIGNED must not be true in production')
  }
  return {
    host: data.SMTP_HOST,
    port: data.SMTP_PORT,
    secure: data.SMTP_SECURE === 'true',
    allowSelfSigned,
    user,
    password,
    from,
    webBaseUrl: web.replace(/\/+$/, ''),
  }
}

/** Only the database URL, for scripts such as `db:seed` that do not serve requests. */
export function loadDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return parseEnv(envSchema.pick({ DATABASE_URL: true }), env).DATABASE_URL
}

/** Read and validate the environment once, at startup. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const data = parseEnv(envSchema, env)
  return {
    port: data.PORT,
    databaseUrl: data.DATABASE_URL,
    apiKey: data.API_KEY,
    auth: { secret: data.AUTH_SECRET, baseUrl: data.AUTH_BASE_URL },
    mail: mailConfigOf(data),
    logLevel: data.LOG_LEVEL,
    rateLimit: { max: data.RATE_LIMIT_MAX, windowSeconds: data.RATE_LIMIT_WINDOW_SECONDS },
    trustProxy: data.TRUST_PROXY,
    corsOrigins: data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    telemetry: {
      serviceName: data.OTEL_SERVICE_NAME,
      serviceVersion: data.npm_package_version,
      environment: data.NODE_ENV,
      otlpEndpoint: data.OTEL_EXPORTER_OTLP_ENDPOINT,
      appInsightsConnectionString: data.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
  }
}
