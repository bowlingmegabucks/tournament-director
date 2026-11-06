import { completeMessage, duplicateNameMessage, unusualPercentMessage } from './createPlan.ts'
import type { DivisionWarning } from './createPlan.ts'
import { pairErrors, type FieldErrors, type NewDivision } from './createRequest.ts'
import type { DivisionEditFacts } from './editFacts.ts'
import type { Division } from './types.ts'
import type { UpdateDivision } from './updateRequest.ts'

/** What the plan needs to know. Storage fills it in, inside its transaction. */
export interface DivisionEditState {
  tournamentCompleted: boolean
  stored: Division
  facts: DivisionEditFacts
  /** The names of the tournament's other divisions, not this one. */
  otherNames: readonly string[]
}

/** What an edit comes to (D-147, D-149). Storage acts on `save` and reports the rest as is. */
export type DivisionEditPlan =
  /** A pair rule fails on the merged values. 400. */
  | { kind: 'invalid'; errors: FieldErrors }
  /** A complete tournament or a name already used. 409 with `errors`; confirming cannot override it. */
  | { kind: 'refused'; errors: FieldErrors }
  /** Allowed, but the director must confirm. 409 with `warnings`. */
  | { kind: 'warn'; warnings: DivisionWarning[] }
  /** Write `changes`. Empty means nothing differs from what is stored. */
  | { kind: 'save'; changes: UpdateDivision }

/** The order the form lists fields, so messages and warnings read the same way every time. */
const fieldOrder = [
  'name',
  'gender',
  'minimumAge',
  'maximumAge',
  'minimumAverage',
  'maximumAverage',
  'handicapPercentage',
  'handicapBase',
  'maximumHandicapPerGame',
] as const satisfies readonly (keyof NewDivision)[]

type Field = (typeof fieldOrder)[number]

const eligibilityFields: ReadonlySet<Field> = new Set([
  'gender',
  'minimumAge',
  'maximumAge',
  'minimumAverage',
  'maximumAverage',
])
const handicapFields: ReadonlySet<Field> = new Set([
  'handicapPercentage',
  'handicapBase',
  'maximumHandicapPerGame',
])

/** The fields each pair rule reads. An error shows only when one of them was sent (D-147). */
const pairs: readonly (readonly Field[])[] = [
  ['minimumAge', 'maximumAge'],
  ['minimumAverage', 'maximumAverage'],
  ['handicapPercentage', 'handicapBase', 'maximumHandicapPerGame'],
]

const registered = (count: number) =>
  count === 1 ? '1 bowler is registered' : `${count} bowlers are registered`

/** D-12: gender, ages, and averages with bowlers already in the division. */
export const eligibilityMessage = (count: number) =>
  `${registered(count)} in this division. The change is not retroactive; review them by hand.`

/** D-147, D-148: a handicap field with scores already saved for this division. */
export const handicapScoresMessage =
  'Scores are saved for bowlers in this division. Posted results change at once.'

/** D-147: scratch to handicap or back, with bowlers registered (`REG-05`). */
export const handicapSwitchMessage = (count: number) =>
  `${registered(count)}. Handicap divisions need a USBC ID; review them by hand.`

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The sent fields whose value differs from the stored one. */
function changedFields(stored: Division, sent: UpdateDivision): UpdateDivision {
  const changes: UpdateDivision = {}
  for (const field of fieldOrder) {
    const value = sent[field]
    if (value !== undefined && value !== stored[field]) Object.assign(changes, { [field]: value })
  }
  return changes
}

function warningsFor(
  state: DivisionEditState,
  changes: UpdateDivision,
  confirmed: boolean,
): DivisionWarning[] {
  if (confirmed) return []
  const { stored, facts } = state
  const warnings: DivisionWarning[] = []
  for (const field of fieldOrder) {
    if (!(field in changes)) continue
    const reasons: string[] = []
    if (eligibilityFields.has(field) && facts.registrationCount > 0) {
      reasons.push(eligibilityMessage(facts.registrationCount))
    }
    if (handicapFields.has(field) && facts.hasScores) reasons.push(handicapScoresMessage)
    if (field === 'handicapPercentage') {
      const next = changes.handicapPercentage ?? null
      if (facts.registrationCount > 0 && (stored.handicapPercentage === null) !== (next === null)) {
        reasons.push(handicapSwitchMessage(facts.registrationCount))
      }
      if (next !== null && next > 100) reasons.push(unusualPercentMessage)
    }
    if (reasons.length > 0) warnings.push({ field, message: reasons.join(' ') })
  }
  return warnings
}

/**
 * Decide what an edit does (D-147 to D-149). Refusals and the merged pair rules come first and
 * cannot be confirmed away (D-129): a complete tournament, a pair rule that fails on the merged
 * values, then a name another division already uses. Then a warning for each changed field that
 * has bowlers or scores behind it. A value equal to the stored one is no change and never warns.
 */
export function planEdit(
  state: DivisionEditState,
  sent: UpdateDivision,
  confirmWarnings: boolean,
): DivisionEditPlan {
  const changes = changedFields(state.stored, sent)
  if (state.tournamentCompleted && Object.keys(changes).length > 0) {
    return { kind: 'refused', errors: { tournament: completeMessage } }
  }

  // The pair rules read the merged values, but a stored odd pair the director never touched must
  // not block a name fix, so only a group with a sent field can fail (D-147).
  const merged = { ...state.stored, ...sent }
  const found = pairErrors(merged)
  const errors: FieldErrors = {}
  for (const group of pairs) {
    if (!group.some((field) => field in sent)) continue
    for (const field of group) {
      const message = found[field]
      if (message !== undefined) errors[field] = message
    }
  }
  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors }

  // Old rows may already share a name, so only a name that changes is checked (D-140).
  if (
    changes.name !== undefined &&
    state.otherNames.some((name) => sameName(name, changes.name ?? ''))
  ) {
    return { kind: 'refused', errors: { name: duplicateNameMessage } }
  }

  const warnings = warningsFor(state, changes, confirmWarnings)
  if (warnings.length > 0) return { kind: 'warn', warnings }
  return { kind: 'save', changes }
}
