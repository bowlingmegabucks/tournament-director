/** What a delete depends on (D-133, D-134). Storage fills it in, inside its transaction. */
export interface DeleteFacts {
  /** The tournament is complete, so it is frozen (D-130). */
  completed: boolean
  /** Any saved score, squad or sweeper. */
  hasScores: boolean
  /**
   * Registrations holding a real payment: a confirmation code that does not start with `Manual_`
   * and an amount above 0 (D-106). One bowler has one registration per tournament (REG-01).
   */
  paidRegistrations: number
  registrations: number
  divisions: number
  squads: number
  sweepers: number
}

/** The warning's field name. Delete has no form field, so the one thing it acts on is named. */
export const deleteField = 'tournament'

export interface DeleteWarning {
  field: typeof deleteField
  message: string
}

/** What a delete comes to (D-133 to D-135). Storage acts on `delete` and reports the rest as is. */
export type DeletePlan =
  /** A fact forbids it. 409 with `errors`; confirming cannot override it. One line per reason. */
  | { kind: 'refused'; reasons: string[] }
  /** Allowed, but the caller must confirm. 409 with `warnings`. */
  | { kind: 'warn'; warnings: DeleteWarning[] }
  | { kind: 'delete' }

export const completeMessage = 'This tournament is complete and cannot be deleted.'
export const scoresMessage = 'Scores are saved, so this tournament cannot be deleted.'

export const paidMessage = (count: number) =>
  `${count === 1 ? '1 bowler paid' : `${count} bowlers paid`} online. Remove ${
    count === 1 ? 'their registration' : 'their registrations'
  } first.`

const noun = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`

/** "a", "a and b", "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

/** What goes with the tournament, leaving out the parts that are empty (D-134). */
export function deleteWarningMessage(facts: DeleteFacts): string {
  const parts = [
    facts.registrations > 0 && noun(facts.registrations, 'registration', 'registrations'),
    facts.divisions > 0 && noun(facts.divisions, 'division', 'divisions'),
    facts.squads > 0 && noun(facts.squads, 'squad', 'squads'),
    facts.sweepers > 0 && noun(facts.sweepers, 'sweeper', 'sweepers'),
  ].filter((part): part is string => part !== false)
  return `${joinList(parts)} will be deleted, with their lane assignments and payment records. The bowlers stay.`
}

/**
 * Decide a delete (D-133, D-134). Refusals come first and `confirmWarnings` never overrides them.
 * A tournament with registrations asks for a second request; one without goes straight through.
 */
export function planDelete(facts: DeleteFacts, confirmWarnings: boolean): DeletePlan {
  const reasons = [
    facts.completed && completeMessage,
    facts.hasScores && scoresMessage,
    facts.paidRegistrations > 0 && paidMessage(facts.paidRegistrations),
  ].filter((reason): reason is string => reason !== false)
  if (reasons.length > 0) return { kind: 'refused', reasons }

  if (facts.registrations > 0 && !confirmWarnings) {
    return {
      kind: 'warn',
      warnings: [{ field: deleteField, message: deleteWarningMessage(facts) }],
    }
  }
  return { kind: 'delete' }
}
