import { planLaneMove, type MoveFacts, type MoveOutcome } from './movePlan.ts'
import { planPairChange, type PairOutcome, type PairRequest } from './pairPlan.ts'

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

/** One pair of one session taken out of play or brought back (OOP-03). */
export type PairChange = PairRequest & {
  tournamentId: string
  kind: SessionKind
  sessionId: string
}

export type PairChangeResult = { notFound: 'tournament' | 'session' } | PairOutcome

/**
 * What the lane move needs from storage (D-216). The Prisma version reads and writes inside one
 * serializable transaction, so two desks cannot take the last seat of a pair (Q-28). Reads for the
 * lane page stay on `LaneRepository`.
 */
export interface LaneWriter {
  move(input: LaneMove): Promise<LaneMoveResult>
  /** In the same kind of transaction as a move, so neither can slip past the other (OOP-02). */
  setPair(input: PairChange): Promise<PairChangeResult>
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
    outOfPlay?: number[]
  }[]
  entries?: { sessionId: string; registrationId: string; position?: string }[]
}

/** Storage in memory. `state.entries` lets a test see the positions after a move. */
export function createInMemoryLaneWriter(seed: InMemoryLaneWriterSeed = {}) {
  const state = {
    tournaments: [...(seed.tournaments ?? [])],
    sessions: (seed.sessions ?? []).map((session) => ({
      ...session,
      outOfPlay: [...(session.outOfPlay ?? [])],
    })),
    entries: (seed.entries ?? []).map((entry) => ({ ...entry, position: entry.position ?? '' })),
  }

  interface Found {
    tournament: (typeof state.tournaments)[number]
    session: (typeof state.sessions)[number]
  }

  const find = (input: {
    tournamentId: string
    kind: SessionKind
    sessionId: string
  }): Found | { notFound: 'tournament' | 'session' } => {
    const tournament = state.tournaments.find((candidate) => candidate.id === input.tournamentId)
    if (!tournament) return { notFound: 'tournament' }
    const session = state.sessions.find(
      (candidate) =>
        candidate.id === input.sessionId &&
        candidate.tournamentId === input.tournamentId &&
        (candidate.kind ?? 'squad') === input.kind,
    )
    return session ? { tournament, session } : { notFound: 'session' }
  }

  const factsOf = (kind: SessionKind, { tournament, session }: Found): MoveFacts => ({
    kind,
    tournamentComplete: tournament.complete ?? false,
    sessionComplete: session.complete ?? false,
    startingLane: session.startingLane ?? 1,
    numberOfLanes: session.numberOfLanes ?? 12,
    maxPerPair: session.maxPerPair ?? 4,
    outOfPlay: session.outOfPlay,
    entries: state.entries.filter((entry) => entry.sessionId === session.id),
  })

  const place = (sessionId: string, registrationId: string, position: string) => {
    const entry = state.entries.find(
      (candidate) =>
        candidate.sessionId === sessionId && candidate.registrationId === registrationId,
    )
    if (entry) entry.position = position
  }

  const writer: LaneWriter = {
    move(input) {
      const found = find(input)
      if ('notFound' in found) return Promise.resolve(found)
      const outcome = planLaneMove(factsOf(input.kind, found), input.registrationId, input.lane)
      if (outcome.type === 'move') {
        place(input.sessionId, input.registrationId, outcome.position)
      }
      return Promise.resolve(outcome)
    },
    setPair(input) {
      const found = find(input)
      if ('notFound' in found) return Promise.resolve(found)
      const outcome = planPairChange(factsOf(input.kind, found), input)
      if (outcome.type === 'save') {
        const { session } = found
        session.outOfPlay = session.outOfPlay.filter((lane) => lane !== input.lane)
        if (!input.inPlay) session.outOfPlay.push(input.lane)
        for (const registrationId of outcome.unassign) place(session.id, registrationId, '')
      }
      return Promise.resolve(outcome)
    },
  }
  return { writer, state }
}
