/**
 * What the squad and sweeper edit pages share (SQD-26, SQD-27, D-180 to D-185): what depends on a
 * session, and the line under each box that says what a change will ask. The API works the same
 * numbers out again on every save and stays the authority (D-129); keep these words in step with
 * `api/src/shared/sessionEdit.ts`.
 */

/** What `GET .../edit-info` returns for a squad or sweeper. The lane facts are `null` with no assignments. */
export interface SessionEditInfo {
  entryCount: number
  assignmentCount: number
  hasScores: boolean
  lowestAssignedLane: number | null
  highestAssignedLane: number | null
  /** The most bowlers assigned to one pair. */
  fullestPair: number | null
}

/** What one box tells the director before they type. */
export interface FieldNote {
  /** The box cannot change, and why: it shows read-only. */
  lock?: string
  /** A change asks for a confirmation, and why. */
  confirm?: string
  /** A limit the box must respect, such as "Lanes 1 to 18 have bowlers assigned". */
  limit?: string
}

/** One thing the API wants confirmed before it saves (409 with `warnings`). */
export interface SessionWarning {
  field: string
  message: string
}

export const bowlersEntered = (count: number) =>
  count === 1 ? '1 bowler is entered.' : `${count} bowlers are entered.`

const assignments = (count: number) =>
  count === 1 ? '1 bowler has a lane assignment.' : `${count} bowlers have lane assignments.`

export const resultsNote = 'Scores are saved. Posted results change at once.'

/** The notes for the fields a squad and a sweeper share, from what depends on the session. */
export function sharedNotes(info: SessionEditInfo): Record<string, FieldNote> {
  const notes: Record<string, FieldNote> = {}
  if (info.entryCount > 0) {
    notes['date'] = {
      confirm: `${bowlersEntered(info.entryCount)} They planned around this time. Tell them.`,
    }
    notes['entryFee'] = {
      confirm: `${bowlersEntered(info.entryCount)} They keep what they paid. New entries pay the new fee.`,
    }
  }
  const { lowestAssignedLane: low, highestAssignedLane: high, fullestPair } = info
  if (info.assignmentCount > 0 && low !== null && high !== null) {
    const confirm = `${assignments(info.assignmentCount)} They keep their lanes, but recap sheets use the lanes and bowlers per pair, so check them.`
    const range =
      low === high
        ? `Lane ${low} has a bowler assigned, so the range must keep it.`
        : `Lanes ${low} to ${high} have bowlers assigned, so the range must keep them.`
    notes['startingLane'] = { limit: range, confirm }
    notes['numberOfLanes'] = { limit: range, confirm }
    notes['maxPerPair'] = {
      confirm,
      ...(fullestPair !== null && {
        limit: `The fullest pair holds ${bowlerCount(fullestPair)}, so this cannot go below ${fullestPair}.`,
      }),
    }
  }
  return notes
}

function bowlerCount(count: number): string {
  return count === 1 ? '1 bowler' : `${count} bowlers`
}

/** The ids of the note lines a box carries, for its `aria-describedby`. */
export function noteIds(id: string, note: FieldNote | undefined): (string | undefined)[] {
  return [
    note?.limit ? `${id}-limit` : undefined,
    note?.lock ? `${id}-lock` : undefined,
    note?.confirm ? `${id}-confirm` : undefined,
  ]
}
