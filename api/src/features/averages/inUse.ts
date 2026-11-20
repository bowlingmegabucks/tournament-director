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
 * The check that still holds. A check copies the provided average it looked at; if
 * `Registrations.Average` has since changed (WinForms writes it directly until it is sunset), the
 * director checked another number, so the check no longer counts and the bowler is unverified again.
 * Saving a new check replaces the stale row.
 */
export function liveCheck<Check extends AverageCheck>(
  provided: number | null,
  check: Check | undefined,
): Check | undefined {
  return check?.providedAverage === provided ? check : undefined
}

/**
 * What a vendor change of the provided average does to a check that stays (AVG-08, D-299). The check
 * copies the new provided number so it keeps counting, and the verified average does not move. If the
 * vendor now sends the verified number, the row is plain verified again (no note). Otherwise a plain
 * verified row becomes adjusted, with a note that says why; a row a director adjusted keeps its note.
 */
export function afterVendorAverage<Check extends AverageCheck>(check: Check, sent: number): Check {
  const note =
    check.verifiedAverage === sent
      ? null
      : (check.note ??
        `Adjusted to ${check.verifiedAverage} based on previous verification. Vendor sent ${sent}.`)
  return { ...check, providedAverage: sent, note }
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

/**
 * Whether a bowler is bowling handicap on an average no director checked (D-293, AVG-12, AVG-13). A
 * scratch division has no handicap, so nothing to check. Lane entries carry `averageStatus`.
 */
export function isUnverified(status: AverageStatus, handicapDivision: boolean): boolean {
  return handicapDivision && status === 'unverified'
}
