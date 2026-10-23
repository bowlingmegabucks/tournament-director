/**
 * What `GET /v1/tournaments/{id}/divisions` returns for one division (DIV-12, D-37). The API's
 * `features/divisions/types.ts` has the same fields: change both together.
 */
export interface Division {
  id: string
  number: number
  name: string
  /** `null` means open to any gender. */
  gender: 'Male' | 'Female' | null
  minimumAge: number | null
  maximumAge: number | null
  minimumAverage: number | null
  maximumAverage: number | null
  /** A whole percent: `90` for 90%. */
  handicapPercentage: number | null
  handicapBase: number | null
  maximumHandicapPerGame: number | null
}
