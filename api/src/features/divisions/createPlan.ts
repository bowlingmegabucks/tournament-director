import type { FieldErrors, NewDivision } from './createRequest.ts'

export const completeMessage = 'This tournament is complete and cannot be changed'
export const duplicateNameMessage = 'A division with this name already exists in this tournament'
export const unusualPercentMessage =
  'A handicap percentage above 100 is unusual. Check that it is right.'

/** Something the director must confirm before the division saves (D-142). */
export interface DivisionWarning {
  field: string
  message: string
}

/** What the rules look at, read inside the save transaction. */
export interface CreateFacts {
  completed: boolean
  /** Every stored division of the tournament: the number and name are all the rules need. */
  divisions: readonly { number: number; name: string }[]
}

export type CreatePlan =
  | { kind: 'refused'; errors: FieldErrors }
  | { kind: 'warn'; warnings: DivisionWarning[] }
  | { kind: 'create'; number: number }

// D-143, D-140 compare the name trimmed and ignoring case; the database collation must not decide.
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Decide what a create does (D-139 to D-143). Refusals come first and cannot be confirmed away
 * (D-129): a complete tournament, then a name already used. A percent over 100 asks for a confirm.
 * Otherwise the number is one more than the highest stored one, and 1 when there are none. An old
 * row stored below 1 never pulls the new number below 1 (`DIV-01`).
 */
export function planCreate(
  facts: CreateFacts,
  input: NewDivision,
  confirmWarnings: boolean,
): CreatePlan {
  if (facts.completed) return { kind: 'refused', errors: { tournament: completeMessage } }
  if (facts.divisions.some((stored) => sameName(stored.name, input.name))) {
    return { kind: 'refused', errors: { name: duplicateNameMessage } }
  }
  if (input.handicapPercentage !== null && input.handicapPercentage > 100 && !confirmWarnings) {
    return {
      kind: 'warn',
      warnings: [{ field: 'handicapPercentage', message: unusualPercentMessage }],
    }
  }
  const highest = Math.max(0, ...facts.divisions.map((stored) => stored.number))
  return { kind: 'create', number: highest + 1 }
}
