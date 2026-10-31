import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { warnOnce } from '../../shared/warnOnce.ts'

/** Where to say that a stored entry was left out, once per process for each `reported` set (D-51). */
export interface Reporting {
  logger: Logger
  reported: Set<string>
}

// Ignores case and accents, as the database collation does (BWL-14).
export const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' })

/**
 * D-83: a stored ratio of 0 or less cannot work out a result (legacy divides by zero). The save
 * screens refuse one, so only an old row can hold it.
 */
export function requireRatios(subject: string, ratios: Record<string, number>): void {
  for (const [name, value] of Object.entries(ratios)) {
    if (value <= 0) {
      throw new HttpError(
        422,
        `${subject} ${name} ratio is ${value}, so results cannot be worked out. Set a ratio of 1 or more.`,
      )
    }
  }
}

export function reportSkipped(
  { logger, reported }: Reporting,
  sessionId: string,
  skipped: readonly string[],
) {
  for (const registrationId of skipped) {
    warnOnce(
      reported,
      `${sessionId}:${registrationId}`,
      logger,
      { registrationId, sessionId },
      'Skipped a result entry whose division is not in this tournament',
    )
  }
}
