import {
  planClear,
  planSave,
  type ScoreFacts,
  type ScorePlan,
  type ScoreWrite,
} from './scorePlan.ts'

export type SessionKind = 'squad' | 'sweeper'

/** One score to save, or one to clear (the `score` is left out): a bowler, a game (D-228). */
export interface ScoreChange {
  tournamentId: string
  kind: SessionKind
  sessionId: string
  registrationId: string
  game: number
  score?: number
}

/** An unknown tournament, session, or bowler not entered in the session is a 404. */
export type ScoreChangeResult =
  { notFound: 'tournament' | 'session' | 'bowler' } | { plan: ScorePlan }

/**
 * What saving and clearing a score need from storage (D-228). The Prisma version reads the facts
 * and writes inside one serializable transaction, so two keepers saving the same bowler cannot
 * both fill the same gap. Reads for the public page stay on `ScoreRepository`.
 */
export interface ScoreWriter {
  change(input: ScoreChange): Promise<ScoreChangeResult>
}

/** Run the plan the change asks for. The Prisma and in-memory writers share it. */
export function planChange(facts: ScoreFacts, input: ScoreChange): ScorePlan {
  return input.score === undefined
    ? planClear(facts, input.game)
    : planSave(facts, input.game, input.score)
}

export interface InMemoryScoreWriterSeed {
  tournaments?: { id: string; complete?: boolean; games?: number }[]
  sessions?: {
    id: string
    tournamentId: string
    kind?: SessionKind
    complete?: boolean
    games?: number
  }[]
  entries?: { sessionId: string; registrationId: string; bowlerId: string }[]
  scores?: { sessionId: string; bowlerId: string; game: number; score: number }[]
}

/** Storage in memory. `state.scores` lets a test see what was written. */
export function createInMemoryScoreWriter(seed: InMemoryScoreWriterSeed = {}) {
  const state = {
    tournaments: [...(seed.tournaments ?? [])],
    sessions: [...(seed.sessions ?? [])],
    entries: [...(seed.entries ?? [])],
    scores: (seed.scores ?? []).map((row) => ({ ...row })),
  }

  const writer: ScoreWriter = {
    change(input) {
      const tournament = state.tournaments.find((candidate) => candidate.id === input.tournamentId)
      if (!tournament) return Promise.resolve({ notFound: 'tournament' })
      const session = state.sessions.find(
        (candidate) =>
          candidate.id === input.sessionId &&
          candidate.tournamentId === input.tournamentId &&
          (candidate.kind ?? 'squad') === input.kind,
      )
      if (!session) return Promise.resolve({ notFound: 'session' })
      const entry = state.entries.find(
        (candidate) =>
          candidate.sessionId === input.sessionId &&
          candidate.registrationId === input.registrationId,
      )
      if (!entry) return Promise.resolve({ notFound: 'bowler' })

      const mine = (row: { sessionId: string; bowlerId: string }) =>
        row.sessionId === input.sessionId && row.bowlerId === entry.bowlerId
      const stored: ScoreWrite[] = state.scores
        .filter(mine)
        .map(({ game, score }) => ({ game, score }))
      const plan = planChange(
        {
          kind: input.kind,
          tournamentComplete: tournament.complete ?? false,
          sessionComplete: session.complete ?? false,
          games: input.kind === 'squad' ? (tournament.games ?? 3) : (session.games ?? 3),
          stored,
        },
        input,
      )
      if (plan.type === 'save') {
        for (const write of plan.writes) {
          const found = state.scores.find((row) => mine(row) && row.game === write.game)
          if (found) found.score = write.score
          else {
            state.scores.push({
              sessionId: input.sessionId,
              bowlerId: entry.bowlerId,
              game: write.game,
              score: write.score,
            })
          }
        }
      } else if (plan.type === 'clear') {
        state.scores = state.scores.filter((row) => !(mine(row) && row.game === plan.game))
      }
      return Promise.resolve({ plan })
    },
  }
  return { writer, state }
}
