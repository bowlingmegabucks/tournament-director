import { completeMessage } from './createPlan.ts'
import type { FieldErrors } from './createRequest.ts'

/** What a delete depends on (D-151). Storage fills it in, inside its transaction. */
export interface DeleteFacts {
  /** The tournament is complete, so it is frozen (D-130, D-143). */
  completed: boolean
  /** Registrations in this division. Scores belong to a registration, so these cover scores too. */
  registrationCount: number
}

/**
 * What the delete dialog shows before the director presses Delete (D-154). The `DELETE` route works
 * the refusals out again.
 */
export interface DivisionDeleteInfo {
  registrationCount: number
  /** Sweepers that hold bonus pins above 0 for this division. A NULL counts as 0 (D-152). */
  sweeperCount: number
}

/** The 409 `errors` key for a reason that is about the tournament, as the add and edit use (D-143). */
const tournamentField = 'tournament'
/** The 409 `errors` key for a reason that is about this division. */
const divisionField = 'division'

/** "12 bowlers are registered in this division. Move them to another division first." (D-151) */
export function registeredMessage(count: number): string {
  const who = count === 1 ? '1 bowler is' : `${count} bowlers are`
  return `${who} registered in this division. Move them to another division first.`
}

/** What a delete comes to. Storage acts on `delete` and reports a refusal as is. */
export type DeletePlan =
  /** A fact forbids it. 409 with `errors`; nothing can override it. Every reason is listed. */
  { kind: 'refused'; errors: FieldErrors } | { kind: 'delete' }

/**
 * Decide a delete (D-151). Two facts refuse it, and both show when both hold: a complete tournament
 * and bowlers registered in the division. Nothing else stops it, the last division included.
 */
export function planDelete(facts: DeleteFacts): DeletePlan {
  const errors: FieldErrors = {}
  if (facts.completed) errors[tournamentField] = completeMessage
  if (facts.registrationCount > 0) {
    errors[divisionField] = registeredMessage(facts.registrationCount)
  }
  return Object.keys(errors).length > 0 ? { kind: 'refused', errors } : { kind: 'delete' }
}
