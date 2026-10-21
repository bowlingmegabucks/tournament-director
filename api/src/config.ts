import { z } from 'zod'

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

// An empty value in .env or App Service settings means "not set".
const optionalText = z
  .string()
  .default('')
  .transform((value) => value.trim() || undefined)

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Comma-separated list. Empty means same-origin only.
  CORS_ORIGIN: z.string().default(''),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  OTEL_SERVICE_NAME: z.string().default('tournament-director-api'),
  // Base OTLP URL, for example http://localhost:15341/ingest/otlp (Seq). The exporters add
  // /v1/traces, /v1/metrics, and /v1/logs, and read OTEL_EXPORTER_OTLP_HEADERS themselves.
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalText,
  // Set by Azure when Application Insights is on. Unset means no Azure export.
  APPLICATIONINSIGHTS_CONNECTION_STRING: optionalText,
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

export type LogLevel = (typeof logLevels)[number]

export interface Config {
  port: number
  logLevel: LogLevel
  corsOrigins: string[]
  telemetry: TelemetryConfig
}

/** Read and validate the environment once, at startup. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`)
  }
  const data = result.data
  return {
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
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
