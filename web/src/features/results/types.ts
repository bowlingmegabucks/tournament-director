export type { SessionKind } from '../../shared/session'

/**
 * What the Results tab reads (RES-31). The API's `features/results/types.ts` has the same fields:
 * change both together.
 */

/**
 * How a results page ranks while games come in (D-239): `full-game` counts only the games every
 * bowler of a division has (the default), `live` counts every saved score.
 */
export type RankMode = 'full-game' | 'live'

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
  /** The total includes the handicap or bonus pins (SCR-08, SCR-09). */
  total: number
  games: number
  ties: Tie[]
}

/** A placed bowler of a squad division. The page draws the lines where `group` changes (RES-11). */
export interface SquadRow extends RankedRow {
  group: 'advancer' | 'casher' | 'other'
  /** The handicap per game (SCR-07). */
  handicap: number
  /** The scratch pins of each game by game number; `null` is a game with no saved score. */
  scores: (number | null)[]
  /** True only for an earlier advancer at or above the cut score (D-81). */
  advancedEarlier: boolean
  /** Flagged "did not finish" in a squad that is still open (D-248, D-251). */
  dnf: boolean
}

/** A bowler listed apart on a complete squad: no place (D-75). */
export interface UnplacedRow {
  registrationId: string
  name: string
  total: number
  games: number
  handicap: number
  scores: (number | null)[]
}

export interface DivisionResult {
  id: string
  number: number
  name: string
  /** `N` (RES-02). Counts no-shows and bowlers who did not finish (D-06, D-75). */
  entries: number
  /** RES-11a: someone in the division has a handicap above 0. */
  showHandicap: boolean
  /**
   * The games counted (D-239): the last game every bowler of the division has, or all the squad's games
   * once it is complete. `null` in live mode. A game above it shows dimmed and is left out of the figures.
   */
  throughGame: number | null
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
  mode: RankMode
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
  /** The scratch pins of each game by game number; `null` is a game with no saved score. */
  scores: (number | null)[]
  /** Flagged "did not finish" in a sweeper that is still open (D-248, D-251). */
  dnf: boolean
}

/** What `GET /v1/tournaments/{id}/sweepers/{sessionId}/results` returns. */
export interface SweeperResults {
  session: ResultsSession & { kind: 'sweeper' }
  mode: RankMode
  /** The games counted (D-239, D-240): `null` in live mode. */
  throughGame: number | null
  cashRatio: number
  /** `N` (RES-22). */
  entries: number
  /** How many cash (RES-24). */
  cashers: number
  /** The last casher's total, `null` with no entries (RES-24). */
  cutScore: number | null
  rows: SweeperRow[]
}

/**
 * What the At-large, Finals seeding, and Super sweeper pages read (RES-37). The API's
 * `features/results/types.ts` has the same fields: change both together. `complete` is true only
 * when the tournament has squads (or sweepers) and every one is complete (D-88).
 */

/** RES-17: a bowler who took an at-large spot. */
export interface AtLargeRow {
  registrationId: string
  name: string
  place: number
  /** The squad of the bowler's best entry (RES-14). A local date and time, `YYYY-MM-DDTHH:mm:ss`. */
  squadDate: string
  total: number
  highGame: number
  /** The bowler cashed in a squad (RES-16, D-07). */
  previousCasher: boolean
  ties: Tie[]
}

export interface AtLargeDivision {
  id: string
  number: number
  name: string
  /** `E`, `S`, `Q`, and the open spots (RES-12, RES-13). */
  entries: number
  totalSpots: number
  squadAdvancers: number
  atLargeSpots: number
  rows: AtLargeRow[]
}

export interface AtLargeResults {
  complete: boolean
  finalsRatio: number
  divisions: AtLargeDivision[]
}

/** RES-20: a finalist, or after the cut line any other bowler. */
export interface SeedingRow {
  registrationId: string
  name: string
  seed: number
  group: 'finalist' | 'other'
  squadDate: string
  total: number
  highGame: number
  handicap: number
  previousCasher: boolean
  ties: Tie[]
}

export interface SeedingDivision {
  id: string
  number: number
  name: string
  entries: number
  finalists: number
  atLarge: number
  showHandicap: boolean
  rows: SeedingRow[]
}

export interface SeedingResults {
  complete: boolean
  finalsRatio: number
  divisions: SeedingDivision[]
}

/** D-90: why a super sweeper row carries a tag. */
export interface SweeperFlag {
  kind: 'missed' | 'unfinished'
  sweeperId: string
  gamesBowled: number
}

export interface SuperSweeperRow extends RankedRow {
  group: 'casher' | 'other'
  divisionName: string
  /** One total per entry of `sweepers`, in that order. `null`: still open, no score yet (D-90). */
  sweeperTotals: (number | null)[]
  /**
   * The scratch games of each entry of `sweepers`, in that order: one per game of a complete sweeper
   * (zero for a game not bowled). `null`: still open, no score yet.
   */
  sweeperScores: (number[] | null)[]
  /** The pins added per game bowled in each entry of `sweepers` (SCR-09). */
  sweeperPins: number[]
  flags: SweeperFlag[]
  /** Flagged "did not finish" in a sweeper that is still open (D-248, D-251). */
  dnf: boolean
}

export interface SuperSweeperResults {
  mode: RankMode
  complete: boolean
  cashRatio: number
  entries: number
  cashers: number
  cutScore: number | null
  /** In date order: one column each. */
  sweepers: {
    id: string
    date: string
    games: number
    complete: boolean
    /** The games counted in this sweeper (D-240): `null` in live mode. */
    throughGame: number | null
  }[]
  rows: SuperSweeperRow[]
}

export type FinalsKind = 'at-large' | 'seeding' | 'super-sweeper'

/**
 * What the TV page loads once (RES-47, D-244): every squad by division, every sweeper, and the super
 * sweeper, ranked through the last full game. The API's `features/results/types.ts` has the same
 * fields: change both together.
 */
export type LiveSession =
  { kind: 'squad'; results: SquadResults } | { kind: 'sweeper'; results: SweeperResults }

export interface LiveResults {
  tournament: { id: string; name: string }
  /** When the answer was worked out, an ISO time. */
  generatedAt: string
  /** Squads in date order, then sweepers in date order (D-242). */
  sessions: LiveSession[]
  superSweeper: SuperSweeperResults | null
}

/** What a message on the tournament stream says (RES-49, D-243): ids and a game, never a score. */
export interface LiveEvent {
  kind: 'game-full' | 'reopened' | 'complete'
  detail: {
    sessionId: string
    sessionKind: 'squad' | 'sweeper'
    divisionId?: string
    game?: number
  }
}
