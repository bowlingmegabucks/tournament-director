import type { SessionKind } from '../../shared/session'

export type { SessionKind }

/**
 * What the Results tab reads (RES-31). The API's `features/results/types.ts` has the same fields:
 * change both together.
 */

/** What separated two bowlers after the total: the games bowled, or the Nth best game (1 = high game). */
export type Decider = { kind: 'games' } | { kind: 'game'; rank: number }

/** D-14, D-16: a tie across the cut or cash line. `decidedBy` is `null` for a full tie. */
export interface Tie {
  line: 'cut' | 'cash'
  outcome: 'won' | 'lost' | 'full'
  decidedBy: Decider | null
}

interface RankedRow {
  registrationId: string
  /** `First Last`, plus `, Suffix`. */
  name: string
  place: number
  /** Total and high game include the handicap or bonus pins (SCR-08, SCR-09). */
  total: number
  highGame: number
  games: number
  ties: Tie[]
}

/** A placed bowler of a squad division. The page draws the lines where `group` changes (RES-11). */
export interface SquadRow extends RankedRow {
  group: 'advancer' | 'casher' | 'other'
  /** The handicap per game (SCR-07). */
  handicap: number
  /** True only for an earlier advancer at or above the cut score (D-81). */
  advancedEarlier: boolean
}

/** A bowler listed apart on a complete squad: no place (D-75). */
export interface UnplacedRow {
  registrationId: string
  name: string
  total: number
  highGame: number
  games: number
  handicap: number
}

export interface DivisionResult {
  id: string
  number: number
  name: string
  /** `N` (RES-02). Counts no-shows and bowlers who did not finish (D-06, D-75). */
  entries: number
  /** RES-11a: someone in the division has a handicap above 0. */
  showHandicap: boolean
  /** D-76: the placed bowlers have unequal game counts. */
  showGames: boolean
  rows: SquadRow[]
  didNotFinish: UnplacedRow[]
  noShows: { registrationId: string; name: string }[]
}

interface ResultsSession {
  id: string
  /** The center's local time with no zone: `2026-10-24T09:00:00`. */
  date: string
  complete: boolean
  /** Games each bowler bowls in the session. */
  games: number
}

/** What `GET /v1/tournaments/{id}/squads/{sessionId}/results` returns. */
export interface SquadResults {
  session: ResultsSession & { kind: 'squad' }
  /** The squad's effective ratios (RES-03, D-43). */
  finalsRatio: number
  cashRatio: number
  /** Sorted by name (RES-10). A division with no entries is left out (D-77). */
  divisions: DivisionResult[]
}

/** A placed bowler of a sweeper: one list, with the division and its bonus pins (RES-22, D-82). */
export interface SweeperRow extends RankedRow {
  group: 'casher' | 'other'
  divisionName: string
  /** The bonus pins per game of the bowler's division (SCR-09). */
  bonusPins: number
}

/** What `GET /v1/tournaments/{id}/sweepers/{sessionId}/results` returns. */
export interface SweeperResults {
  session: ResultsSession & { kind: 'sweeper' }
  cashRatio: number
  /** `N` (RES-22). */
  entries: number
  /** How many cash (RES-24). */
  cashers: number
  /** The last casher's total, `null` with no entries (RES-24). */
  cutScore: number | null
  rows: SweeperRow[]
}
