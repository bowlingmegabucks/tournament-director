import { refuseSession, type SessionFacts } from '../../shared/sessionCreate.ts'
import type { FieldErrors, NewSweeper } from './createRequest.ts'

export const unknownDivisionMessage = 'A division no longer exists. Reload the page'

/** What the rules look at, read inside the save transaction. */
export interface CreateFacts extends SessionFacts {
  /** The ids of the tournament's divisions. */
  divisionIds: ReadonlySet<string>
}

export type CreatePlan = { kind: 'refused'; errors: FieldErrors } | { kind: 'create' }

/**
 * Decide what a create does (SQD-10, SQD-13, D-171, D-177). Refusals come first and cannot be
 * confirmed away (D-129): a complete tournament, a date outside it, then a division that is not
 * one of the tournament's.
 */
export function planCreate(facts: CreateFacts, input: NewSweeper): CreatePlan {
  const refused = refuseSession(facts, input.date, 'Sweeper')
  if (refused) return { kind: 'refused', errors: refused }
  if (Object.keys(input.bonusPins).some((id) => !facts.divisionIds.has(id))) {
    return { kind: 'refused', errors: { bonusPins: unknownDivisionMessage } }
  }
  return { kind: 'create' }
}
