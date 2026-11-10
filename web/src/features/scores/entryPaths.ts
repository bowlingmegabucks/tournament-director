import type { SessionKind } from '../../shared/session'

/** The address of score entry: the board of a game, or the sheet of one pair in it (SCR-21, D-230). */
export function entryPath(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  game?: number,
  firstLane?: number,
): string {
  const base = `/tournaments/${tournamentId}/${kind}s/${sessionId}/scores/entry`
  if (game === undefined) return base
  return firstLane === undefined ? `${base}/${game}` : `${base}/${game}/${firstLane}`
}
