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
