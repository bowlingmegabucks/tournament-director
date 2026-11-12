import type { FieldErrors } from './createRequest.ts'

/**
 * The complete-tournament rules (TRN-10, D-130, D-257). Completing closes every open squad and
 * sweeper, then sets `Completed`, and cannot be undone. Storage fills the facts in, inside its
 * transaction, and does the writes; this file decides.
 */

/** What a complete depends on. */
export interface CompleteFacts {
  /** The tournament is already complete (D-130: no undo). */
  completed: boolean
  /** Squads of the tournament, open or complete. Sweepers alone do not count (D-257). */
  squadCount: number
}

export const alreadyCompleteMessage = 'This tournament is already complete'
export const noSquadMessage = 'Add a squad before you complete this tournament'

export type CompletePlan =
  /** A fact forbids it. 409 with `errors`; every reason is listed, the first one comes first. */
  { kind: 'refused'; errors: FieldErrors } | { kind: 'complete' }

/**
 * Decide a complete (D-257). Part scores, open sessions with no scores, and sessions that are all
 * complete already do not block it.
 */
export function planComplete(facts: CompleteFacts): CompletePlan {
  const reasons: string[] = []
  if (facts.completed) reasons.push(alreadyCompleteMessage)
  if (facts.squadCount === 0) reasons.push(noSquadMessage)
  // One field, as delete does: the reasons are lines of one message (TRN-33).
  return reasons.length > 0
    ? { kind: 'refused', errors: { tournament: reasons.join('\n') } }
    : { kind: 'complete' }
}
