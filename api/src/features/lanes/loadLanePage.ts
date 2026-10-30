import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { buildLanePage, type BuiltLanePage, type LaneSession } from './lanePage.ts'
import { MAX_SEATS, MIN_SEATS } from './positions.ts'
import type { LaneRepository } from './repository.ts'
import type { LaneEntry } from './types.ts'

/** Finds one session of the tournament, as a `LaneSession`. Squad or sweeper, so a route is one handler. */
export type FindSession = (
  tournamentId: string,
  sessionId: string,
) => Promise<(LaneSession & { games: number }) | undefined>

export interface LanePageDeps {
  lanes: LaneRepository
  tournaments: TournamentRepository
  divisions: DivisionRepository
}

/**
 * The lane page of one squad or sweeper, for every route that builds on it (the lane page, the
 * recap sheets). One place holds the checks, so the routes cannot drift apart: an unknown
 * tournament is a 404 and stops there (a random id costs one query, as TRN-15), then an unknown
 * session is a 404, then a pairs setting the page cannot seat is a 422 (LAN-02, D-56, Q-10). The
 * scores view turns the 422 off with `checkSeats: false`: any session shows its scores (D-73).
 * It also returns the entries it read, so a caller that needs them does not read twice.
 * `label` is `Squad` or `Sweeper`, for the 404 text.
 */
export async function loadLanePage(
  label: 'Squad' | 'Sweeper',
  findSession: FindSession,
  { lanes, tournaments, divisions }: LanePageDeps,
  tournamentId: string,
  sessionId: string,
  options: { checkSeats: boolean } = { checkSeats: true },
): Promise<
  BuiltLanePage & { session: LaneSession & { games: number }; entries: readonly LaneEntry[] }
> {
  const tournament = await tournaments.get(tournamentId)
  if (!tournament) throw new HttpError(404, 'Tournament not found')
  const session = await findSession(tournamentId, sessionId)
  if (!session) throw new HttpError(404, `${label} not found`)
  if (options.checkSeats && (session.maxPerPair < MIN_SEATS || session.maxPerPair > MAX_SEATS)) {
    throw new HttpError(
      422,
      `Bowlers per pair must be ${MIN_SEATS} to ${MAX_SEATS} to assign lanes`,
    )
  }

  const [entries, tournamentDivisions] = await Promise.all([
    lanes.listEntries(sessionId),
    divisions.listByTournament(tournamentId),
  ])
  return { session, entries, ...buildLanePage(session, entries, tournamentDivisions) }
}
