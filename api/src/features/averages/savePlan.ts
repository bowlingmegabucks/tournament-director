import { averageInUse, type AverageCheck } from './inUse.ts'
import { maxNoteLength, type CheckBody } from './types.ts'

/** What a save depends on, read before it (D-291, D-294). */
export interface CheckFacts {
  bowlerName: string
  tournamentComplete: boolean
  /** Whether the registration's division has a handicap percentage. */
  handicap: boolean
  /** `Registrations.Average` now. */
  providedAverage: number | null
  minimumAverage: number | null
  maximumAverage: number | null
  /** The squads and sweepers of this tournament the bowler has a score in. */
  scored: readonly { complete: boolean }[]
  existing: AverageCheck | undefined
}

export type CheckPlan =
  | { kind: 'refused'; status: 400 | 409; message: string }
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'confirm'; warnings: { field: string; message: string }[] }
  | { kind: 'save'; check: AverageCheck }
  | { kind: 'remove' }

export const completeMessage = 'This tournament is complete. Averages cannot change.'
const notHandicapMessage = 'This registration is not in a handicap division.'
const noCheckMessage = 'This registration has no average check to remove.'
const noAverageMessage = 'Enter an average with Adjust before it can be verified.'
const noteRequiredMessage = 'Say why the average changed, or where it came from.'
const noteLengthMessage = `Note must be ${maxNoteLength} characters or fewer.`

/** REG-16 words for a bad number, D-291 words for a limit. */
function averageProblem(value: unknown, facts: CheckFacts): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value))
    return 'Average must be a whole number.'
  if (value < 1) return 'Average must be greater than 0.'
  if (value > 300) return 'Average must be less than or equal to 300.'
  const { maximumAverage, minimumAverage } = facts
  if (maximumAverage !== null && value > maximumAverage) {
    return 'The verified average is above the division limit. Move the bowler to another division.'
  }
  if (minimumAverage !== null && value < minimumAverage) {
    return 'The verified average is below the division limit. Move the bowler to another division.'
  }
  return undefined
}

/**
 * The warning a change of the average in use needs when the bowler has scores (D-294, AVG-06).
 * No warning when the number does not change, or the bowler has no score yet.
 */
function warningFor(facts: CheckFacts, next: number | null) {
  if (facts.scored.length === 0) return []
  if (next === averageInUse(facts.providedAverage, facts.existing)) return []
  const lines = [
    `${facts.bowlerName} already has scores. A new average changes handicap, so results change.`,
  ]
  if (facts.scored.some((session) => session.complete)) {
    lines.push('A squad or sweeper they bowled is complete. Payouts already made may now be wrong.')
  }
  return [{ field: 'average', message: lines.join(' ') }]
}

function guard(facts: CheckFacts): Extract<CheckPlan, { kind: 'refused' }> | undefined {
  if (facts.tournamentComplete) return { kind: 'refused', status: 409, message: completeMessage }
  if (!facts.handicap) return { kind: 'refused', status: 400, message: notHandicapMessage }
  return undefined
}

type Made = { check: AverageCheck } | { errors: Record<string, string> }

function verifyCheck(facts: CheckFacts): Made {
  if (facts.providedAverage === null) return { errors: { average: noAverageMessage } }
  return {
    check: {
      providedAverage: facts.providedAverage,
      verifiedAverage: facts.providedAverage,
      note: null,
    },
  }
}

function adjustCheck(facts: CheckFacts, body: Extract<CheckBody, { action: 'adjust' }>): Made {
  const errors: Record<string, string> = {}
  const problem = averageProblem(body.average, facts)
  if (problem) errors.average = problem
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note === '') errors.note = noteRequiredMessage
  else if (note.length > maxNoteLength) errors.note = noteLengthMessage
  if (Object.keys(errors).length > 0) return { errors }
  return {
    check: { providedAverage: facts.providedAverage, verifiedAverage: Number(body.average), note },
  }
}

/** A save: a verify or an adjust (AVG-03 to AVG-06). A scores warning waits for `confirmWarnings`. */
export function planCheck(
  facts: CheckFacts,
  body: CheckBody,
): Exclude<CheckPlan, { kind: 'remove' }> {
  const refused = guard(facts)
  if (refused) return refused

  const made = body.action === 'verify' ? verifyCheck(facts) : adjustCheck(facts, body)
  if ('errors' in made) return { kind: 'invalid', errors: made.errors }
  const check = made.check

  const warnings = warningFor(facts, check.verifiedAverage)
  if (warnings.length > 0 && body.confirmWarnings !== true) return { kind: 'confirm', warnings }
  return { kind: 'save', check }
}

/** Taking a check away puts handicap back on the provided average (AVG-07). */
export function planRemove(
  facts: CheckFacts,
  confirmWarnings: boolean,
): Exclude<CheckPlan, { kind: 'save' }> {
  const refused = guard(facts)
  if (refused) return refused
  if (facts.existing === undefined) return { kind: 'refused', status: 400, message: noCheckMessage }
  const warnings = warningFor(facts, facts.providedAverage)
  if (warnings.length > 0 && !confirmWarnings) return { kind: 'confirm', warnings }
  return { kind: 'remove' }
}
