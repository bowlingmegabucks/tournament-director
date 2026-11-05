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

/** What a delete would remove besides the tournament row. The confirming request echoes it (D-137). */
export interface DeleteCounts {
  registrations: number
  divisions: number
  squads: number
  sweepers: number
}

export const countsOf = (facts: DeleteFacts): DeleteCounts => ({
  registrations: facts.registrations,
  divisions: facts.divisions,
  squads: facts.squads,
  sweepers: facts.sweepers,
})

const sameCounts = (a: DeleteCounts, b: DeleteCounts) =>
  a.registrations === b.registrations &&
  a.divisions === b.divisions &&
  a.squads === b.squads &&
  a.sweepers === b.sweepers

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
  /** Allowed, but the caller must confirm what `counts` says goes. 409 with `warnings` and `counts`. */
  | { kind: 'warn'; warnings: DeleteWarning[]; counts: DeleteCounts }
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
 * Decide a delete (D-133, D-134, D-137). Refusals come first and `confirmWarnings` never overrides
 * them. A tournament with anything under it asks for a second request. That request must carry
 * the counts the caller saw (`seen`): if the tournament changed since, it gets a fresh warning
 * instead of a delete. The route makes `seen` required; a caller that leaves it out confirms
 * whatever is there.
 */
export function planDelete(
  facts: DeleteFacts,
  confirmWarnings: boolean,
  seen?: DeleteCounts,
): DeletePlan {
  const reasons = [
    facts.completed && completeMessage,
    facts.hasScores && scoresMessage,
    facts.paidRegistrations > 0 && paidMessage(facts.paidRegistrations),
  ].filter((reason): reason is string => reason !== false)
  if (reasons.length > 0) return { kind: 'refused', reasons }

  const counts = countsOf(facts)
  const holdsSomething = Object.values(counts).some((count) => count > 0)
  const confirmed = confirmWarnings && (seen === undefined || sameCounts(seen, counts))
  if (holdsSomething && !confirmed) {
    return {
      kind: 'warn',
      warnings: [{ field: deleteField, message: deleteWarningMessage(facts) }],
      counts,
    }
  }
  return { kind: 'delete' }
}
