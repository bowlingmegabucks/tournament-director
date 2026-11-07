import { refuseSession, type SessionFacts } from '../../shared/sessionCreate.ts'
import type { FieldErrors, NewSquad } from './createRequest.ts'

export { completeMessage } from '../../shared/sessionCreate.ts'
export const beforeStartMessage = 'Squad date must be after tournament start'
export const afterEndMessage = 'Squad date must be before tournament end'

export type CreateFacts = SessionFacts

export type CreatePlan = { kind: 'refused'; errors: FieldErrors } | { kind: 'create' }

/** Decide what a create does (SQD-03, D-169, D-171): the shared refusals, with "Squad" in the words. */
export function planCreate(facts: CreateFacts, input: NewSquad): CreatePlan {
  const errors = refuseSession(facts, input.date, 'Squad')
  return errors ? { kind: 'refused', errors } : { kind: 'create' }
}
