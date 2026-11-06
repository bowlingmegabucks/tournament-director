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

/**
 * What `POST /v1/tournaments/{id}/divisions` takes (DIV-12, D-138). The API's
 * `features/divisions/createRequest.ts` has the same fields and rules: change both together. The
 * number is not here: the server picks it (D-139).
 */
export interface NewDivision {
  name: string
  gender: 'Male' | 'Female' | null
  minimumAge: number | null
  maximumAge: number | null
  minimumAverage: number | null
  maximumAverage: number | null
  /** A whole percent as typed: 90 means 90 percent. */
  handicapPercentage: number | null
  handicapBase: number | null
  maximumHandicapPerGame: number | null
}

/** What the form holds: every box as text, so a half-typed value is not lost. */
export interface DivisionFormValues {
  name: string
  /** `''` is any gender. */
  gender: '' | 'Male' | 'Female'
  minimumAge: string
  maximumAge: string
  minimumAverage: string
  maximumAverage: string
  handicapPercentage: string
  handicapBase: string
  maximumHandicapPerGame: string
}

export type DivisionField = keyof DivisionFormValues

/** In the order the form shows them, so the first problem is the first box. */
export const divisionFields: readonly DivisionField[] = [
  'name',
  'gender',
  'minimumAge',
  'maximumAge',
  'minimumAverage',
  'maximumAverage',
  'handicapPercentage',
  'handicapBase',
  'maximumHandicapPerGame',
]

/** One message per field (D-121). */
export type DivisionFieldErrors = Partial<Record<DivisionField, string>>

/** One thing the director must confirm before the division saves (D-142). */
export interface DivisionWarning {
  field: string
  message: string
}

/** What `PATCH /v1/tournaments/{id}/divisions/{divisionId}` takes: only the fields that changed (DIV-12). */
export type DivisionChanges = Partial<NewDivision>

/**
 * What `GET /v1/tournaments/{id}/divisions/{divisionId}/edit-info` returns (D-147, D-148). The API's
 * `features/divisions/editFacts.ts` has the same fields: change both together.
 */
export interface DivisionEditInfo {
  /** Registrations in this division. */
  registrationCount: number
  /** Any saved score of a bowler registered in this division. */
  hasScores: boolean
}

/** A line of text per field, shown under its box. */
export type DivisionFieldNotes = Partial<Record<DivisionField, string>>
