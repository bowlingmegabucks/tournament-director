import type { FieldErrors } from '../features/tournaments/createRequest.ts'
import { completeMessage } from './sessionCreate.ts'
import type { SessionKind } from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'

/**
 * The complete rules a squad and a sweeper share (SQD-15 to SQD-18, D-190 to D-192). Completing
 * sets `complete` and cannot be undone. A squad also saves a zero for every game of each entered
 * bowler who has no scores (D-06), so a paid no-show stays an entry. A sweeper saves nothing more.
 */

/** What a complete depends on. Storage fills it in, inside its transaction (D-192). */
export interface SessionCompleteFacts {
  /** The tournament is complete, so it is frozen (D-130). */
  completed: boolean
  /** This session is already complete (`SQD-18`: there is no undo). */
  complete: boolean
}

/** "This squad is already complete". */
export const alreadyCompleteMessage = (kind: SessionKind) => `This ${kind} is already complete`

export type SessionCompletePlan =
  /** A fact forbids it. 409 with `errors`; every reason is listed. */
  { kind: 'refused'; errors: FieldErrors } | { kind: 'complete' }

/** Decide a complete (D-192). The tournament's reason comes first. A session with no entries completes. */
export function planSessionComplete(
  facts: SessionCompleteFacts,
  kind: SessionKind,
): SessionCompletePlan {
  const errors: FieldErrors = {}
  if (facts.completed) errors.tournament = completeMessage
  if (facts.complete) errors.session = alreadyCompleteMessage(kind)
  return Object.keys(errors).length > 0 ? { kind: 'refused', errors } : { kind: 'complete' }
}

/** One entered bowler and how many games the bowler has saved in this squad. */
export interface EntryScores {
  bowlerId: string
  savedGames: number
}

/** What the complete dialog shows for a squad (D-194). */
export interface SquadCompleteInfo {
  entryCount: number
  /** Entered bowlers with no scores: each gets a zero for every game. */
  noScoreCount: number
  /** Entered bowlers with some games but fewer than `games`: left as entered (D-75). */
  partialCount: number
  games: number
}

/** What the complete dialog shows for a sweeper: it fills nothing in (D-191). */
export interface SweeperCompleteInfo {
  entryCount: number
}

/** One row per bowler. Two registrations of one bowler count once, with the larger game count. */
function perBowler(entries: readonly EntryScores[]): EntryScores[] {
  const byBowler = new Map<string, number>()
  for (const { bowlerId, savedGames } of entries) {
    byBowler.set(bowlerId, Math.max(byBowler.get(bowlerId) ?? 0, savedGames))
  }
  return [...byBowler].map(([bowlerId, savedGames]) => ({ bowlerId, savedGames }))
}

/** The bowlers who get zeros (`SQD-15`): entered, with no saved game at all. */
export function noShowBowlers(entries: readonly EntryScores[]): string[] {
  return perBowler(entries)
    .filter((entry) => entry.savedGames === 0)
    .map((entry) => entry.bowlerId)
}

/** The zero rows to save: game 1 to `games` for each no-show. */
export function zeroScores(
  bowlerIds: readonly string[],
  games: number,
): { bowlerId: string; game: number }[] {
  return bowlerIds.flatMap((bowlerId) =>
    Array.from({ length: games }, (_, index) => ({ bowlerId, game: index + 1 })),
  )
}

export function squadCompleteInfo(
  entries: readonly EntryScores[],
  games: number,
): SquadCompleteInfo {
  const bowlers = perBowler(entries)
  return {
    entryCount: bowlers.length,
    noScoreCount: bowlers.filter((entry) => entry.savedGames === 0).length,
    partialCount: bowlers.filter((entry) => entry.savedGames > 0 && entry.savedGames < games)
      .length,
    games,
  }
}

/** How a complete ended. Only `completed` changed anything. */
export type CompleteSessionOutcome<Session> =
  | SessionNotFound
  | { refused: FieldErrors }
  /** `noShowCount` is the bowlers who got zeros; always 0 for a sweeper. */
  | { completed: Session; noShowCount: number }

/** What the complete and complete-info routes need from storage, for a squad or a sweeper. */
export interface SessionCompleter<Session, Info> {
  complete(tournamentId: string, sessionId: string): Promise<CompleteSessionOutcome<Session>>
  /** What the dialog shows before the director presses Complete (D-194). */
  getCompleteInfo(tournamentId: string, sessionId: string): Promise<Info | SessionNotFound>
}

/**
 * Plan a complete and, when it goes ahead, call `persist` with the bowlers to zero. Both writers
 * use this, so the rules live in one place and storage only reads and writes. A sweeper passes no
 * entries, so it zeroes nobody.
 */
export async function applySessionComplete(
  facts: SessionCompleteFacts,
  kind: SessionKind,
  entries: readonly EntryScores[],
  persist: (noShows: string[]) => Promise<void>,
): Promise<{ refused: FieldErrors } | { noShowCount: number }> {
  const plan = planSessionComplete(facts, kind)
  if (plan.kind === 'refused') return { refused: plan.errors }
  const noShows = kind === 'squad' ? noShowBowlers(entries) : []
  await persist(noShows)
  return { noShowCount: noShows.length }
}
