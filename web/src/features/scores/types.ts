import type { SessionKind } from '../../shared/session'

export type { SessionKind }

/**
 * One bowler on the Scores tab (SCR-13, D-69). `scores` has one entry per column and `null` is a
 * game with no score. `total` is the scratch sum of the scores present (D-68). `position` is the
 * stored text. The API's `features/scores/types.ts` has the same fields: change both together.
 */
export interface ScoreBowler {
  registrationId: string
  /** `First Last`, plus `, Suffix`. */
  name: string
  divisionName: string
  position: string
  scores: (number | null)[]
  total: number
}

/** One lane pair that holds at least one bowler (D-73). */
export interface ScorePair {
  firstLane: number
  lanes: number[]
  bowlers: ScoreBowler[]
}

/** What `GET /v1/tournaments/{id}/squads/{sessionId}/scores` (or `/sweepers/...`) returns. */
export interface ScorePage {
  session: {
    id: string
    kind: SessionKind
    /** The center's local time with no zone: `2026-10-24T09:00:00`. */
    date: string
    complete: boolean
    /** Columns shown (D-69). */
    games: number
  }
  pairs: ScorePair[]
  /** Bowlers with no lane, who are not listed (D-71). */
  noLane: number
  /** Bowlers whose stored position fits no pair of this session (D-61, D-71). */
  other: ScoreBowler[]
}
