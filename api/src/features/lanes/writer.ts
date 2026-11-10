import { planLaneMove, type MoveFacts, type MoveOutcome } from './movePlan.ts'

export type SessionKind = 'squad' | 'sweeper'

/** One move of one bowler (D-216): to the pair whose first lane is `lane`, or off the lanes. */
export interface LaneMove {
  tournamentId: string
  kind: SessionKind
  sessionId: string
  registrationId: string
  lane: number | null
}

/** How a move ends. An unknown tournament or session is a 404 (`LAN-14`); the rest are in `MoveOutcome`. */
export type LaneMoveResult = { notFound: 'tournament' | 'session' } | MoveOutcome

/**
 * What the lane move needs from storage (D-216). The Prisma version reads and writes inside one
 * serializable transaction, so two desks cannot take the last seat of a pair (Q-28). Reads for the
 * lane page stay on `LaneRepository`.
 */
export interface LaneWriter {
  move(input: LaneMove): Promise<LaneMoveResult>
}

export interface InMemoryLaneWriterSeed {
  tournaments?: { id: string; complete?: boolean }[]
  sessions?: {
    id: string
    tournamentId: string
    kind?: SessionKind
    complete?: boolean
    startingLane?: number
    numberOfLanes?: number
    maxPerPair?: number
  }[]
  entries?: { sessionId: string; registrationId: string; position?: string }[]
}

/** Storage in memory. `state.entries` lets a test see the positions after a move. */
export function createInMemoryLaneWriter(seed: InMemoryLaneWriterSeed = {}) {
  const state = {
    tournaments: [...(seed.tournaments ?? [])],
    sessions: [...(seed.sessions ?? [])],
    entries: (seed.entries ?? []).map((entry) => ({ ...entry, position: entry.position ?? '' })),
  }

  const writer: LaneWriter = {
    move(input) {
      const tournament = state.tournaments.find((candidate) => candidate.id === input.tournamentId)
      if (!tournament) return Promise.resolve({ notFound: 'tournament' })
      const session = state.sessions.find(
        (candidate) =>
          candidate.id === input.sessionId &&
          candidate.tournamentId === input.tournamentId &&
          (candidate.kind ?? 'squad') === input.kind,
      )
      if (!session) return Promise.resolve({ notFound: 'session' })

      const facts: MoveFacts = {
        kind: input.kind,
        tournamentComplete: tournament.complete ?? false,
        sessionComplete: session.complete ?? false,
        startingLane: session.startingLane ?? 1,
        numberOfLanes: session.numberOfLanes ?? 12,
        maxPerPair: session.maxPerPair ?? 4,
        entries: state.entries.filter((entry) => entry.sessionId === input.sessionId),
      }
      const outcome = planLaneMove(facts, input.registrationId, input.lane)
      if (outcome.type === 'move') {
        const entry = state.entries.find(
          (candidate) =>
            candidate.sessionId === input.sessionId &&
            candidate.registrationId === input.registrationId,
        )
        if (entry) entry.position = outcome.position
      }
      return Promise.resolve(outcome)
    },
  }
  return { writer, state }
}
