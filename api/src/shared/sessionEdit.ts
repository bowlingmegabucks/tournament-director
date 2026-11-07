import type { FieldErrors } from '../features/tournaments/createRequest.ts'
import { completeMessage, lastLane, laneBlockMessage, refuseSession } from './sessionCreate.ts'
import type { SessionFacts } from './sessionCreate.ts'

/**
 * The edit rules a squad and a sweeper share (SQD-23 to SQD-25, D-180 to D-182): what a change to
 * the date, the lanes, and bowlers per pair needs. Each feature adds its own money fields. The
 * facts count only this session (D-180).
 */

/** The fields of a session an edit can change. `date` is `YYYY-MM-DDTHH:mm:00`. */
export interface StoredSession {
  date: string
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
}

export const sessionFieldNames = ['date', 'startingLane', 'numberOfLanes', 'maxPerPair'] as const

/** What else in the database depends on one session (D-180). */
export interface SessionEditFacts {
  /** Registered bowlers on this session (`SquadRegistration` rows). */
  entryCount: number
  /** Any saved score for this session. */
  hasScores: boolean
  /** The lane of each saved position that reads as `<lane><letter>` (LAN-01). One per bowler. */
  assignedLanes: number[]
}

export const noSessionEditFacts: SessionEditFacts = {
  entryCount: 0,
  hasScores: false,
  assignedLanes: [],
}

/** What `GET .../edit-info` sends (D-185). The three lane facts are `null` with no assignments. */
export interface SessionEditInfo {
  entryCount: number
  assignmentCount: number
  hasScores: boolean
  lowestAssignedLane: number | null
  highestAssignedLane: number | null
  /** The most bowlers assigned to one pair. */
  fullestPair: number | null
}

/** The lane pair a lane belongs to: an odd lane and the even lane after it (D-182). */
export const pairOfLane = (lane: number) => (lane % 2 === 1 ? lane : lane - 1)

/** The most bowlers in one pair, and the first lane of the first pair with that many. */
function fullestPairOf(lanes: readonly number[]): { count: number; firstLane: number } | undefined {
  const counts = new Map<number, number>()
  for (const lane of lanes) counts.set(pairOfLane(lane), (counts.get(pairOfLane(lane)) ?? 0) + 1)
  let best: { count: number; firstLane: number } | undefined
  for (const [firstLane, count] of [...counts].sort(([a], [b]) => a - b)) {
    if (best === undefined || count > best.count) best = { count, firstLane }
  }
  return best
}

export function toSessionEditInfo(facts: SessionEditFacts): SessionEditInfo {
  const lanes = facts.assignedLanes
  return {
    entryCount: facts.entryCount,
    assignmentCount: lanes.length,
    hasScores: facts.hasScores,
    lowestAssignedLane: lanes.length > 0 ? Math.min(...lanes) : null,
    highestAssignedLane: lanes.length > 0 ? Math.max(...lanes) : null,
    fullestPair: fullestPairOf(lanes)?.count ?? null,
  }
}

/** What the plan needs to know. Storage fills it in. */
export interface SessionEditContext {
  tournament: SessionFacts
  /** The session itself is complete (D-181). */
  complete: boolean
  stored: StoredSession
  facts: SessionEditFacts
}

/** Which id an edit could not find. A session of another tournament counts as not found. */
export interface SessionNotFound {
  notFound: 'tournament' | 'session'
}

export interface EditWarning {
  field: string
  message: string
}

/** What an edit comes to (D-180 to D-184). Storage acts on `save` and reports the rest as is. */
export type EditPlan<Changes> =
  /** The merged lanes pass the last lane. 400. */
  | { kind: 'invalid'; errors: FieldErrors }
  /** A lock holds. 409 with `errors`; confirming cannot override it. */
  | { kind: 'refused'; errors: FieldErrors }
  /** Allowed, but the director must confirm. 409 with `warnings`. */
  | { kind: 'warn'; warnings: EditWarning[] }
  /** Write `changes`. Empty means nothing differs from what is stored. */
  | { kind: 'save'; changes: Changes }

/** The fields of `input` whose value differs from `stored`. A field left out is not a change. */
export function changedFields<T extends object>(stored: T, input: Partial<T>): Partial<T> {
  const changes: Partial<T> = {}
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key]
    if (value !== undefined && value !== stored[key]) changes[key] = value
  }
  return changes
}

const lower = (subject: string) => subject.toLowerCase()

export const sessionCompleteMessage = (subject: string) =>
  `This ${lower(subject)} is complete and cannot be changed`

/** A complete tournament, then a complete session, refuses every edit (D-181). */
export function frozenRefusal(
  context: Pick<SessionEditContext, 'tournament' | 'complete'>,
  subject: string,
): FieldErrors | undefined {
  if (context.tournament.completed) return { tournament: completeMessage }
  if (context.complete) return { session: sessionCompleteMessage(subject) }
  return undefined
}

/** The merged lanes must end at the last lane (D-179); the request checked it when both were sent. */
export function laneBlockProblem(
  stored: StoredSession,
  changes: Partial<StoredSession>,
): FieldErrors | undefined {
  if (changes.startingLane === undefined && changes.numberOfLanes === undefined) return undefined
  const start = changes.startingLane ?? stored.startingLane
  const count = changes.numberOfLanes ?? stored.numberOfLanes
  if (start + count - 1 > lastLane) return { numberOfLanes: laneBlockMessage }
  return undefined
}

const bowlersEntered = (count: number) =>
  count === 1 ? '1 bowler is entered.' : `${count} bowlers are entered.`

const assignments = (count: number) =>
  count === 1 ? '1 bowler has a lane assignment.' : `${count} bowlers have lane assignments.`

export const strandedLaneMessage = (lane: number) =>
  `Lane ${lane} has a bowler assigned. Move them first.`
export const strandedPairMessage = (firstLane: number, count: number) =>
  `Pair ${firstLane}-${firstLane + 1} holds ${count} bowlers. Move them first.`

/**
 * Refusals that cannot be confirmed away (D-129), besides the frozen ones: a date outside the
 * tournament (`SQD-03`) and a change that strands a bowler (D-182). A field that did not change is
 * never refused (D-17). The kind's own refusals add to the result.
 */
export function sessionRefusals(
  context: SessionEditContext,
  changes: Partial<StoredSession>,
  subject: string,
): FieldErrors {
  const errors: FieldErrors = {}
  if (changes.date !== undefined) {
    // The frozen case is handled first, so this only finds a date outside the tournament.
    Object.assign(errors, refuseSession(context.tournament, changes.date, subject))
  }
  const lanes = context.facts.assignedLanes
  if (changes.startingLane !== undefined || changes.numberOfLanes !== undefined) {
    const start = changes.startingLane ?? context.stored.startingLane
    const end = start + (changes.numberOfLanes ?? context.stored.numberOfLanes) - 1
    const below = lanes.filter((lane) => lane < start)
    const above = lanes.filter((lane) => lane > end)
    if (below.length > 0) errors['startingLane'] = strandedLaneMessage(Math.min(...below))
    if (above.length > 0) errors['numberOfLanes'] = strandedLaneMessage(Math.max(...above))
  }
  if (changes.maxPerPair !== undefined) {
    const fullest = fullestPairOf(lanes)
    if (fullest && fullest.count > changes.maxPerPair) {
      errors['maxPerPair'] = strandedPairMessage(fullest.firstLane, fullest.count)
    }
  }
  return errors
}

/** What the director must confirm for the shared fields. Only a field that really changes warns. */
export function sessionWarnings(
  context: SessionEditContext,
  changes: Partial<StoredSession>,
): EditWarning[] {
  const warnings: EditWarning[] = []
  const { entryCount, assignedLanes } = context.facts
  if (changes.date !== undefined && entryCount > 0) {
    warnings.push({
      field: 'date',
      message: `${bowlersEntered(entryCount)} They planned around this time. Tell them.`,
    })
  }
  const lanesChanged = (['startingLane', 'numberOfLanes', 'maxPerPair'] as const).find(
    (field) => changes[field] !== undefined,
  )
  if (lanesChanged !== undefined && assignedLanes.length > 0) {
    warnings.push({
      field: lanesChanged,
      message: `${assignments(assignedLanes.length)} They keep their lanes, but recap sheets use the lanes and bowlers per pair, so check them.`,
    })
  }
  return warnings
}

/** The fee warning both kinds share (D-180). */
export function feeWarning(context: SessionEditContext): EditWarning | undefined {
  const { entryCount } = context.facts
  if (entryCount === 0) return undefined
  return {
    field: 'entryFee',
    message: `${bowlersEntered(entryCount)} They keep what they paid. New entries pay the new fee.`,
  }
}

export const resultsMessage = 'Scores are saved. Posted results change at once.'

/** Put warnings in the order the form lists its fields, so they read the same every time. */
export function inFormOrder(warnings: EditWarning[], order: readonly string[]): EditWarning[] {
  const place = (warning: EditWarning) => {
    const index = order.indexOf(warning.field.split('.')[0] ?? '')
    return index === -1 ? order.length : index
  }
  return [...warnings].sort((a, b) => place(a) - place(b))
}
