import type { FieldErrors } from '../features/tournaments/createRequest.ts'
import { completeMessage } from './sessionCreate.ts'
import type { SessionNotFound } from './sessionEdit.ts'

/**
 * The delete rules a squad and a sweeper share (SQD-14, D-186). Four facts refuse a delete, and
 * nothing overrides them: a complete tournament, a complete session, any bowler entered, any score
 * saved. Entries are never removed as a side effect (D-06, D-11).
 */

/** Squads and sweepers read alike in a message except for this word. */
export type SessionKind = 'squad' | 'sweeper'

/** What a delete depends on. Storage fills it in, inside its transaction (D-189). */
export interface SessionDeleteFacts {
  /** The tournament is complete, so it is frozen (D-130). */
  completed: boolean
  /** This session is complete and stays for good (D-10, `SQD-18`). */
  complete: boolean
  /** Bowlers entered in this session (`SquadRegistration` rows). */
  entryCount: number
  /** Scores saved for this session (`SquadScores` rows). */
  scoreCount: number
}

/** What the delete dialog shows before the director presses Delete (D-188). */
export interface SessionDeleteInfo {
  entryCount: number
  scoreCount: number
}

export const noSessionDeleteInfo = (given: Partial<SessionDeleteInfo> = {}): SessionDeleteInfo => ({
  entryCount: 0,
  scoreCount: 0,
  ...given,
})

/** "This squad is complete and cannot be deleted." */
export const sessionCompleteDeleteMessage = (kind: SessionKind) =>
  `This ${kind} is complete and cannot be deleted.`

/** "12 bowlers are entered in this squad. Remove them from the squad first." */
export function enteredMessage(kind: SessionKind, count: number): string {
  const who = count === 1 ? '1 bowler is' : `${count} bowlers are`
  return `${who} entered in this ${kind}. Remove them from the ${kind} first.`
}

/** "Scores are saved for this squad, so it cannot be deleted." */
export const scoresMessage = (kind: SessionKind) =>
  `Scores are saved for this ${kind}, so it cannot be deleted.`

/** What a delete comes to. Storage acts on `delete` and reports a refusal as is. */
export type SessionDeletePlan =
  /** A fact forbids it. 409 with `errors`; every reason is listed. */
  { kind: 'refused'; errors: FieldErrors } | { kind: 'delete' }

/**
 * Decide a delete (D-186). The tournament's reason comes first, then the session's, then the
 * entries, then the scores. The last session of a tournament can go.
 */
export function planSessionDelete(facts: SessionDeleteFacts, kind: SessionKind): SessionDeletePlan {
  const errors: FieldErrors = {}
  if (facts.completed) errors.tournament = completeMessage
  if (facts.complete) errors.session = sessionCompleteDeleteMessage(kind)
  if (facts.entryCount > 0) errors.entries = enteredMessage(kind, facts.entryCount)
  if (facts.scoreCount > 0) errors.scores = scoresMessage(kind)
  return Object.keys(errors).length > 0 ? { kind: 'refused', errors } : { kind: 'delete' }
}

/** How a delete ended. Only `deleted` removed anything. */
export type DeleteSessionOutcome = SessionNotFound | { refused: FieldErrors } | { deleted: true }

/** What the delete and delete-info routes need from storage, for a squad or a sweeper. */
export interface SessionDeleter {
  remove(tournamentId: string, sessionId: string): Promise<DeleteSessionOutcome>
  /** What the delete dialog shows before the director presses Delete (D-188). */
  getDeleteInfo(
    tournamentId: string,
    sessionId: string,
  ): Promise<SessionDeleteInfo | SessionNotFound>
}

/**
 * Plan a delete and, when it goes ahead, call `persist`. Both writers use this, so the rules live
 * in one place (`planSessionDelete`) and storage only reads and writes.
 */
export async function applySessionDelete(
  facts: SessionDeleteFacts,
  kind: SessionKind,
  persist: () => Promise<void>,
): Promise<{ refused: FieldErrors } | { deleted: true }> {
  const plan = planSessionDelete(facts, kind)
  if (plan.kind === 'refused') return { refused: plan.errors }
  await persist()
  return { deleted: true }
}
