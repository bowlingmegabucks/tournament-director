/** `none` is a division with no handicap; the API sends the other three for handicap divisions (D-287). */
export type AverageStatus = 'unverified' | 'verified' | 'adjusted'

/** One registration in a handicap division, as the Averages page reads it (AVG-02). */
export interface AverageRow {
  registrationId: string
  bowlerName: string
  divisionName: string
  usbcId: string
  /** What the bowler gave (the checked row's own copy once checked). `null`: none. */
  providedAverage: number | null
  status: AverageStatus
  /** The average handicap uses (D-288). */
  averageInUse: number | null
  /** Why it was adjusted; `null` unless adjusted. */
  note: string | null
  /** The name of the user who checked it. */
  verifiedBy: string | null
  /** ISO time. */
  verifiedAt: string | null
}

export interface AverageList {
  rows: AverageRow[]
  tournamentComplete: boolean
}

/** What a director sends: a verify, or a new average with the reason (D-291). */
export type CheckAction =
  { action: 'verify' } | { action: 'adjust'; average: number | null; note: string }
