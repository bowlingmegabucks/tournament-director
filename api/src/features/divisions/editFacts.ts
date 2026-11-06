/**
 * What else in the database depends on one division's settings (D-147, D-148). The edit page shows
 * its notes from this; the `PATCH` route works the whole of it out again on every save.
 */
export interface DivisionEditFacts {
  /** Registrations in this division. */
  registrationCount: number
  /** Any saved score, squad or sweeper, of a bowler registered in this division (D-148). */
  hasScores: boolean
}

/** What `GET /v1/tournaments/{id}/divisions/{divisionId}/edit-info` sends. */
export type DivisionEditInfo = DivisionEditFacts

export const noDivisionEditFacts: DivisionEditFacts = { registrationCount: 0, hasScores: false }
