import type { Logger } from './logger.ts'

/** The most keys a `reported` set holds. Past it the set starts over, so a long run cannot grow it without limit. */
export const MAX_REPORTED = 1000

/**
 * Log a warning the first time `key` is seen in `reported`. A route that polls would otherwise fill
 * the log with the same stored-data problem on every call. At the cap the set empties, so a warning
 * can repeat but the memory stays small.
 */
export function warnOnce(
  reported: Set<string>,
  key: string,
  log: Logger,
  fields: Record<string, unknown>,
  message: string,
): void {
  if (reported.has(key)) return
  if (reported.size >= MAX_REPORTED) reported.clear()
  reported.add(key)
  log.warn(fields, message)
}
