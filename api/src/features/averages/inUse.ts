/** What a director saved when checking a registration's average (D-287). */
export interface AverageCheck {
  /** The registration's average when it was checked; `null` when the bowler gave none. */
  providedAverage: number | null
  /** The average handicap uses. */
  verifiedAverage: number
  /** Why it was adjusted, or where the number came from. `null` means the provided average was verified. */
  note: string | null
}

/** No check is unverified; a check with no note is verified; a check with a note is adjusted (D-287). */
export type AverageStatus = 'unverified' | 'verified' | 'adjusted'

export function averageStatus(check: AverageCheck | undefined): AverageStatus {
  if (check === undefined) return 'unverified'
  return check.note === null ? 'verified' : 'adjusted'
}

/**
 * The average handicap uses (D-288, AVG-09): the checked average when a director checked it,
 * otherwise the one the bowler gave. Every screen that works out a handicap asks here, and none
 * reads `Registrations.Average` for it.
 */
export function averageInUse(
  provided: number | null,
  check: AverageCheck | undefined,
): number | null {
  return check?.verifiedAverage ?? provided
}
