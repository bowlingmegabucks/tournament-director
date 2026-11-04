import type { FieldErrors, NewTournament } from './createRequest.ts'
import type { EditFacts, SessionFact } from './editFacts.ts'
import type { UpdateTournament } from './updateRequest.ts'

/** The stored fields an edit can change, plus the flag that freezes them (D-130). */
export interface StoredTournament extends NewTournament {
  completed: boolean
}

/** What the plan needs to know. Storage fills it in, inside its transaction. */
export interface EditState {
  stored: StoredTournament
  facts: EditFacts
  /** Another tournament, not this one, has the same name and start date (D-123). */
  hasRival(name: string, startDate: string): Promise<boolean>
}

export interface EditWarning {
  field: keyof NewTournament
  message: string
}

/** What an edit comes to (D-128, D-129). Storage acts on `save` and reports the rest as is. */
export type EditPlan =
  /** The dates are out of order. 400. */
  | { kind: 'invalid'; errors: FieldErrors }
  /** A lock holds. 409 with `errors`; confirming cannot override it. */
  | { kind: 'refused'; errors: FieldErrors }
  | { kind: 'duplicate' }
  /** Allowed, but the director must confirm. 409 with `warnings`. */
  | { kind: 'warn'; warnings: EditWarning[] }
  /** Write `changes`. Empty means nothing differs from what is stored. */
  | { kind: 'save'; changes: Partial<NewTournament> }

/** The order the form lists fields, so messages and warnings read the same way every time. */
const fieldOrder = [
  'name',
  'startDate',
  'endDate',
  'bowlingCenter',
  'entryFee',
  'games',
  'finalsRatio',
  'cashRatio',
  'superSweeperCashRatio',
] as const satisfies readonly (keyof NewTournament)[]

export const completedMessage = 'This tournament is complete. Nothing can change.'
export const gamesLockedMessage = 'Scores are saved, so the number of games cannot change.'
export const startDateLockedMessage = 'Scores are saved, so the start date cannot change.'
export const endBeforeStartMessage = 'End date must be on or after start date'
const resultsMessage = 'Scores are saved. Posted results change at once.'
const sweeperResultsMessage = 'Sweeper scores are saved. Posted results change at once.'

const bowlers = (count: number) =>
  count === 1 ? '1 bowler is registered.' : `${count} bowlers are registered.`

const day = (date: Date) => date.toISOString().slice(0, 10)

/** "Saturday 9:00 AM squad". Legacy stores local time as is, so read the clock in UTC. */
function describeSession({ kind, date }: SessionFact): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  // Built by hand: newer Intl data puts a narrow no-break space before AM and PM.
  const time = `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
  return `${weekday} ${time} ${kind}`
}

function changesIn(stored: StoredTournament, input: UpdateTournament): Partial<NewTournament> {
  const changes: Partial<NewTournament> = {}
  for (const field of fieldOrder) {
    const value = input[field]
    // The type of each field follows from its name, which TypeScript cannot see across the loop.
    if (value !== undefined && value !== stored[field]) Object.assign(changes, { [field]: value })
  }
  return changes
}

/** Locks that hold whatever the director says (D-128). */
function lockErrors(
  changes: Partial<NewTournament>,
  facts: EditFacts,
  effective: { startDate: string; endDate: string },
): FieldErrors {
  const errors: FieldErrors = {}
  if (changes.games !== undefined && facts.hasScores) errors['games'] = gamesLockedMessage
  if (changes.startDate !== undefined) {
    const first = facts.firstSession
    if (facts.hasScores) {
      errors['startDate'] = startDateLockedMessage
    } else if (first && day(first.date) < effective.startDate) {
      errors['startDate'] =
        `${describeSession(first)} is on ${day(first.date)}, before this start date. Move or remove it first.`
    }
  }
  if (changes.endDate !== undefined) {
    const last = facts.lastSession
    if (last && day(last.date) > effective.endDate) {
      errors['endDate'] =
        `${describeSession(last)} is on ${day(last.date)}, after this end date. Move or remove it first.`
    }
  }
  return errors
}

/** What the director must confirm. Only a field that really changes can warn (D-128). */
function warningsFor(changes: Partial<NewTournament>, facts: EditFacts): EditWarning[] {
  const warnings: EditWarning[] = []
  const add = (field: keyof NewTournament, message: string) => warnings.push({ field, message })
  const registered = facts.registrationCount > 0
  if (changes.startDate !== undefined && registered) {
    add(
      'startDate',
      `${bowlers(facts.registrationCount)} Ages are measured on the start date, so the change is not retroactive. Some bowlers may no longer fit their division. Review them by hand.`,
    )
  }
  if (changes.entryFee !== undefined && registered) {
    add(
      'entryFee',
      `${bowlers(facts.registrationCount)} They keep what they paid. New entries pay the new fee.`,
    )
  }
  if (changes.finalsRatio !== undefined && facts.hasScores) add('finalsRatio', resultsMessage)
  if (changes.cashRatio !== undefined && facts.hasScores) add('cashRatio', resultsMessage)
  if (changes.superSweeperCashRatio !== undefined && facts.hasSweeperScores) {
    add('superSweeperCashRatio', sweeperResultsMessage)
  }
  return warnings
}

/**
 * Decide what an edit does (TRN-24 to TRN-27, D-127 to D-130). Checks run in this order: dates,
 * completed, locks, duplicate, warnings. A refusal never gives way to `confirmWarnings`.
 */
export async function planEdit(state: EditState, input: UpdateTournament): Promise<EditPlan> {
  const { stored, facts } = state
  const changes = changesIn(stored, input)
  if (Object.keys(changes).length === 0) return { kind: 'save', changes }

  const effective = {
    name: changes.name ?? stored.name,
    startDate: changes.startDate ?? stored.startDate,
    endDate: changes.endDate ?? stored.endDate,
  }
  // ISO dates compare as text. The stored dates are valid, and the request's passed their own rule.
  if (effective.endDate < effective.startDate) {
    return { kind: 'invalid', errors: { endDate: endBeforeStartMessage } }
  }

  if (stored.completed) {
    const errors: FieldErrors = {}
    for (const field of fieldOrder) if (field in changes) errors[field] = completedMessage
    return { kind: 'refused', errors }
  }

  const locked = lockErrors(changes, facts, effective)
  if (Object.keys(locked).length > 0) return { kind: 'refused', errors: locked }

  if (
    (changes.name !== undefined || changes.startDate !== undefined) &&
    (await state.hasRival(effective.name, effective.startDate))
  ) {
    return { kind: 'duplicate' }
  }

  const warnings = warningsFor(changes, facts)
  if (warnings.length > 0 && input.confirmWarnings !== true) return { kind: 'warn', warnings }
  return { kind: 'save', changes }
}
