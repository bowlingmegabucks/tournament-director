import type { Response } from 'express'
import { pino, type DestinationStream, type Logger } from 'pino'
import type { Config } from '../config.ts'

export type { Logger }

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
