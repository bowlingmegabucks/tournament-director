/** A squad or a sweeper: both use the lane page (D-60). */
export type SessionKind = 'squad' | 'sweeper'

/**
 * One bowler on the lane page (LAN-11). `pins` is the handicap on a squad and the bonus pins on a
 * sweeper. `position` is `''` when the bowler has no lane (D-58). The API's `features/lanes/types.ts`
 * has the same fields: change both together.
 */
export interface LaneBowler {
  registrationId: string
  /** `First Last`, plus `, Suffix`. */
  name: string
  /** For sorting the unassigned list by last name, then first (D-58). */
  firstName: string
  lastName: string
  divisionId: string
  divisionName: string
  average: number | null
  position: string
  pins: number
  superSweeper: boolean
}

/** One lane pair, the drop zone on the page (LAN-03). Full at `capacity` bowlers (D-56). */
export interface LanePair {
  firstLane: number
  lanes: number[]
  capacity: number
  bowlers: LaneBowler[]
}

/** What `GET /v1/tournaments/{id}/squads/{sessionId}/lanes` (or `/sweepers/...`) returns. */
export interface LanePage {
  session: {
    id: string
    kind: SessionKind
    /** The center's local time with no zone: `2026-10-24T09:00:00`. */
    date: string
    complete: boolean
    startingLane: number
    numberOfLanes: number
    maxPerPair: number
  }
  pairs: LanePair[]
  /** Bowlers with no position, sorted by name. */
  unassigned: LaneBowler[]
  /** Bowlers whose position fits no pair of this session (D-61). */
  other: LaneBowler[]
  /** Bowlers entered per division, in division order (LAN-10). */
  divisions: { id: string; number: number; name: string; entries: number }[]
}
