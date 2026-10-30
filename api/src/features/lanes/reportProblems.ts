import type { Logger } from '../../shared/logger.ts'

function warnOnce(
  reported: Set<string>,
  key: string,
  log: Logger,
  fields: Record<string, unknown>,
  message: string,
): void {
  if (reported.has(key)) return
  reported.add(key)
  log.warn(fields, message)
}

/**
 * Warn about the stored rows a lane page leaves out or cannot place (D-51, D-61): an entry whose
 * division is not in the tournament, and a position that fits no pair. Once per process for each
 * `reported` set, so a page that polls does not fill the log. The lane route and the scores route
 * each keep their own set.
 */
export function reportLanePageProblems(
  reported: Set<string>,
  log: Logger,
  sessionId: string,
  { skipped, outsideLanes }: { skipped: readonly string[]; outsideLanes: readonly string[] },
): void {
  for (const registrationId of skipped) {
    warnOnce(
      reported,
      `division:${sessionId}:${registrationId}`,
      log,
      { registrationId, sessionId },
      'Skipped a lane entry whose division is not in this tournament',
    )
  }
  for (const registrationId of outsideLanes) {
    warnOnce(
      reported,
      `outside:${sessionId}:${registrationId}`,
      log,
      { registrationId, sessionId },
      'A lane position fits no pair of this session',
    )
  }
}
