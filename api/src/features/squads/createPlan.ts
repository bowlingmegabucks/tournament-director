import type { FieldErrors, NewSquad } from './createRequest.ts'

export const completeMessage = 'This tournament is complete and cannot be changed'
export const beforeStartMessage = 'Squad date must be after tournament start'
export const afterEndMessage = 'Squad date must be before tournament end'

/** What the rules look at, read inside the save transaction. */
export interface CreateFacts {
  completed: boolean
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD` */
  endDate: string
}

export type CreatePlan = { kind: 'refused'; errors: FieldErrors } | { kind: 'create' }

/**
 * Decide what a create does (SQD-03, D-169, D-171). Refusals come first and cannot be confirmed
 * away (D-129): a complete tournament, then a date outside the tournament. The date counts from
 * 00:00 on the start day to the end of the end day, so comparing the day is enough.
 */
export function planCreate(facts: CreateFacts, input: NewSquad): CreatePlan {
  if (facts.completed) return { kind: 'refused', errors: { tournament: completeMessage } }
  const day = input.date.slice(0, 10)
  if (day < facts.startDate) return { kind: 'refused', errors: { date: beforeStartMessage } }
  if (day > facts.endDate) return { kind: 'refused', errors: { date: afterEndMessage } }
  return { kind: 'create' }
}
