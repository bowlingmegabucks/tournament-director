import type { Response } from 'express'
import { pino, type DestinationStream, type Logger } from 'pino'
import type { Config } from '../config.ts'

export type { Logger }

// Spelling variants too: the column is `SocialSecurityNumber`, the setting is `ENCRYPTION_KEY`.
const redactedFields = [
  'ssn',
  'SSN',
  'socialSecurityNumber',
  'SocialSecurityNumber',
  'encryptionKey',
  'ENCRYPTION_KEY',
]
const MAX_DEPTH = 5
// `*` matches one key, so `*.*.ssn` is two levels down. Pino's wildcard cannot match any depth.
const redactedPaths = redactedFields.flatMap((field) =>
  Array.from({ length: MAX_DEPTH }, (_, depth) =>
    [...Array<string>(depth).fill('*'), field].join('.'),
  ),
)

/**
 * JSON lines on stdout. When telemetry is on, the pino instrumentation (see telemetry.ts) also
 * adds trace ids and sends each line to the OTel log pipeline. Pass `destination` in tests.
 */
export function createLogger(
  config: Pick<Config, 'logLevel'> & { telemetry: Pick<Config['telemetry'], 'serviceName'> },
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level: config.logLevel,
      // Drop pid and hostname; the OTel resource already names the service.
      base: { service: config.telemetry.serviceName },
      // A logged object never carries an SSN or the key (SEC-13, D-265), up to MAX_DEPTH levels deep.
      // A field nested deeper needs its own path.
      redact: { paths: redactedPaths, censor: '[Redacted]' },
    },
    destination,
  )
}

/** The logger for this request (it carries `requestId`), or `fallback` outside a request. */
export function requestLogger(res: Response, fallback: Logger): Logger {
  const logger: unknown = res.locals['logger']
  return isLogger(logger) ? logger : fallback
}

function isLogger(value: unknown): value is Logger {
  return typeof value === 'object' && value !== null && 'child' in value && 'info' in value
}
