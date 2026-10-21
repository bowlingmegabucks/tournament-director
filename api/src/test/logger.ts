import { Writable } from 'node:stream'
import type { LogLevel } from '../config.ts'
import { createLogger, type Logger } from '../shared/logger.ts'
import { createConfig } from './factories.ts'

export interface CapturedLogger {
  logger: Logger
  /** Every line written so far, parsed. */
  records: () => Record<string, unknown>[]
}

/** A logger that keeps its output in memory, so a test can check what was logged. */
export function createCapturedLogger(level: LogLevel = 'info'): CapturedLogger {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString())
      done()
    },
  })
  const logger = createLogger({ ...createConfig(), logLevel: level }, destination)
  return {
    logger,
    records: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  }
}
