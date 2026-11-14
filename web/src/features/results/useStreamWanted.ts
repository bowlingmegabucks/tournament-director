import { useTabVisible } from '../../shared/useTabVisible'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'

/**
 * Whether a squad or sweeper Results tab should hold its stream. An open session always does. A
 * complete session's scores cannot move; only a payout save (D-285) changes its rows, so it follows
 * the stream only while the tournament is open and the tab is in front. A tab that comes back
 * refetches on focus. This keeps old sessions from holding one of the 500 streams (D-217) in tabs
 * nobody is looking at. `complete` is `undefined` until the first answer.
 */
export function useStreamWanted(tournamentId: string, complete: boolean | undefined): boolean {
  const tournamentOpen = useTournamentOpen(tournamentId)
  const visible = useTabVisible()
  if (complete === undefined) return false
  return !complete || (tournamentOpen && visible)
}
