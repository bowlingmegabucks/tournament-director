/** One squad or sweeper date, for the "squad is outside the dates" refusal (D-128). */
export interface SessionFact {
  kind: 'squad' | 'sweeper'
  /** Legacy stores local time as is; read it as UTC and the clock reads right. */
  date: Date
}

/**
 * What else in the database depends on a tournament's settings (D-128). The edit page shows its
 * locks from `EditInfo`; the `PATCH` route works out the whole of this again on every save.
 */
export interface EditFacts {
  /** Registrations in the tournament, counted through their division (Q-26). */
  registrationCount: number
  /** Any saved score, squad or sweeper. */
  hasScores: boolean
  /** Any saved score in a sweeper. */
  hasSweeperScores: boolean
  /** The earliest and latest squad or sweeper. Absent when there are none. */
  firstSession?: SessionFact
  lastSession?: SessionFact
}

/** What `GET /v1/tournaments/{id}/edit-info` sends (D-131). */
export type EditInfo = Pick<EditFacts, 'registrationCount' | 'hasScores' | 'hasSweeperScores'>

export const noEditFacts: EditFacts = {
  registrationCount: 0,
  hasScores: false,
  hasSweeperScores: false,
}
