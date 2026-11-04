/** The vendor summary shape (`API-03`, `API-04`). The API's `types.ts` has the same fields: change both together. */
export interface Tournament {
  id: string
  name: string
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD` */
  endDate: string
  entryFee: number
  bowlingCenter: string
}

/**
 * Games and the three ratios (D-126). The API's `types.ts` has the same fields: change both
 * together. The super sweeper ratio may hold the legacy 0 (D-17).
 */
export interface TournamentSettings {
  games: number
  finalsRatio: number
  cashRatio: number
  superSweeperCashRatio: number
}

/** What the create route takes and sends back (TRN-19). */
export interface NewTournament extends TournamentSettings {
  name: string
  startDate: string
  endDate: string
  entryFee: number
  bowlingCenter: string
}

/** What the form holds while the director types: text, not numbers. */
export interface TournamentFormValues {
  name: string
  startDate: string
  endDate: string
  bowlingCenter: string
  entryFee: string
  games: string
  finalsRatio: string
  cashRatio: string
  superSweeperCashRatio: string
}

export type TournamentField = keyof TournamentFormValues

/** One message per field (D-121). */
export type FieldErrors = Partial<Record<TournamentField, string>>
