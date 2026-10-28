/** Bonus pins per game for one division. The API leaves out divisions with 0 (D-45). */
export interface BonusPins {
  divisionId: string
  divisionName: string
  bonusPinsPerGame: number
}

/**
 * What `GET /v1/tournaments/{id}/sweepers` returns for one sweeper (SQD-22, D-41). The API's
 * `features/sweepers/types.ts` has the same fields: change both together.
 */
export interface Sweeper {
  id: string
  /** The center's local time with no zone: `2026-10-24T18:00:00`. */
  date: string
  complete: boolean
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  /** A sweeper's fee, games, and cash ratio are its own, never the tournament's (D-43). */
  entryFee: number
  games: number
  cashRatio: number
  bonusPins: BonusPins[]
}
