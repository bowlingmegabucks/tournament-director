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

/**
 * What `POST /v1/tournaments/{id}/sweepers` takes (SQD-10 to SQD-13, D-174). The API's
 * `features/sweepers/createRequest.ts` has the same fields and rules: change both together.
 * `bonusPins` names the divisions the form showed; a blank box is `null` (D-176).
 */
export interface NewSweeper {
  /** `YYYY-MM-DDTHH:mm`, the center's local time. */
  date: string
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  entryFee: number
  games: number
  cashRatio: number
  bonusPins: Record<string, number | null>
}

/** What the form holds: every box as text, so a half-typed value is not lost. */
export interface SweeperFormValues {
  date: string
  startingLane: string
  numberOfLanes: string
  maxPerPair: string
  entryFee: string
  games: string
  cashRatio: string
  /** Division id to the text in its box. A division never typed in has no key. */
  bonusPins: Record<string, string>
}

export type SweeperScalarField = Exclude<keyof SweeperFormValues, 'bonusPins'>

/** In the order the form shows them, so the first problem is the first box. */
export const sweeperScalarFields: readonly SweeperScalarField[] = [
  'date',
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'games',
  'cashRatio',
]

/** The key of a bonus-pins box's message, as the API sends it (D-176). */
export const pinKey = (divisionId: string) => `bonusPins.${divisionId}`

/**
 * One message per field. A box for a division is keyed `bonusPins.<divisionId>`; the group as a
 * whole (a gone division, D-177) is `bonusPins`.
 */
export type SweeperFieldErrors = Record<string, string>
