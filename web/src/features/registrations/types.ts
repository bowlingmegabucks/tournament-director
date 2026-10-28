/**
 * What `GET /v1/tournaments/{id}/registrations` returns for one registration (REG-23, REG-26,
 * D-47). The API's `features/registrations/types.ts` has the same fields: change both together.
 */
export interface Registration {
  id: string
  bowler: {
    id: string
    /** `First Last`, plus `, Suffix` (BWL-13). */
    name: string
    firstName: string
    lastName: string
    /** `''` when the bowler has none. */
    usbcId: string
  }
  divisionId: string
  divisionName: string
  /** Qualifying squads entered. */
  squads: number
  sweepers: number
  superSweeper: boolean
}

/** Counts for the whole tournament, not the filtered rows (REG-24, D-50). */
export interface Summary {
  registrations: number
  superSweepers: number
  /** Squads entered by the bowlers in the division. Sweepers do not count (REG-24). */
  divisions: { id: string; number: number; name: string; entries: number }[]
  squads: { id: string; date: string; entries: number }[]
  sweepers: { id: string; date: string; entries: number }[]
}

export interface RegistrationList {
  registrations: Registration[]
  summary: Summary
}
