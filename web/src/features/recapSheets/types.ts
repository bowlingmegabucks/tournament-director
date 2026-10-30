/**
 * The recap sheets of one squad or sweeper (RPT-08). The API's `features/recapSheets/types.ts` has
 * the same fields: change both together.
 */
export type SkipPattern = 'staggered' | 'same'

/** One bowler's sheet (RPT-05). `handicap` is the bonus pins on a sweeper (SCR-09). */
export interface RecapSheet {
  registrationId: string
  /** `First Last`, plus `, Suffix`. */
  name: string
  divisionName: string
  /** The saved position, such as `1A`. */
  position: string
  handicap: number
  /** One lane label per game (`12A`), for each skip pattern (D-64). */
  cross: Record<SkipPattern, string[]>
}

export interface RecapSession {
  id: string
  kind: 'squad' | 'sweeper'
  /** The center's local time with no zone: `2026-10-24T09:00:00`. */
  date: string
  games: number
  complete: boolean
}

export interface RecapSheets {
  session: RecapSession
  /** In lane order, then letter. */
  sheets: RecapSheet[]
  /** Bowlers with no sheet: no lane, or a position outside the session's lanes (D-65). */
  withoutLane: number
}
