import type { RegistrationWriter } from './writer.ts'

/** The squad and sweeper ids behind a registration's session ids (REG-01, D-165). */
export async function sessionIdsByKind(
  writer: RegistrationWriter,
  sessionIds: string[],
): Promise<{ squadIds: string[]; sweeperIds: string[] }> {
  const sessions = await writer.findSessions(sessionIds)
  return {
    squadIds: sessions.filter((session) => session.kind === 'squad').map((session) => session.id),
    sweeperIds: sessions
      .filter((session) => session.kind === 'sweeper')
      .map((session) => session.id),
  }
}

/**
 * Whether the bowler has any score in this tournament (D-160). Scores from an earlier tournament
 * do not count.
 */
export async function hasScoresIn(
  writer: RegistrationWriter,
  bowlerId: string,
  tournamentId: string,
): Promise<boolean> {
  const scored = await writer.findSessions(await writer.findScoredSessionIds(bowlerId))
  return scored.some((session) => session.tournamentId === tournamentId)
}
