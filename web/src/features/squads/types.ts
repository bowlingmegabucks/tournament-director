/**
 * What `GET /v1/tournaments/{id}/squads` returns for one squad (SQD-21, D-41, D-43). The API's
 * `features/squads/types.ts` has the same fields: change both together.
 */
export interface Squad {
  id: string
  /** The center's local time with no zone: `2026-10-24T09:00:00`. */
  date: string
  complete: boolean
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  /** The squad's own value if it sets one, else the tournament's. `…Overridden` says which (TRN-12). */
  entryFee: number
  entryFeeOverridden: boolean
  finalsRatio: number
  finalsRatioOverridden: boolean
  cashRatio: number
  cashRatioOverridden: boolean
  /** Games each bowler bowls on this squad: the tournament's (TRN-04). */
  games: number
}
