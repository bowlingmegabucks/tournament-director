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

/**
 * What `POST /v1/tournaments/{id}/squads` takes (SQD-01 to SQD-08, D-167). The API's
 * `features/squads/createRequest.ts` has the same fields and rules: change both together. A fee or
 * ratio that is `null` falls back on the tournament's value (TRN-12, D-170).
 */
export interface NewSquad {
  /** `YYYY-MM-DDTHH:mm`, the center's local time. */
  date: string
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  entryFee: number | null
  finalsRatio: number | null
  cashRatio: number | null
}

/** What `PATCH /v1/tournaments/{id}/squads/{squadId}` takes: only the fields that changed (SQD-23, D-184). */
export type SquadChanges = Partial<NewSquad>

/** What the form holds: every box as text, so a half-typed value is not lost. */
export interface SquadFormValues {
  date: string
  startingLane: string
  numberOfLanes: string
  maxPerPair: string
  entryFee: string
  finalsRatio: string
  cashRatio: string
}

export type SquadField = keyof SquadFormValues

/** In the order the form shows them, so the first problem is the first box. */
export const squadFields: readonly SquadField[] = [
  'date',
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'finalsRatio',
  'cashRatio',
]

/** One message per field. */
export type SquadFieldErrors = Partial<Record<SquadField, string>>
