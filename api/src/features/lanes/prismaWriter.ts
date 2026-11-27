import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { toDivision } from '../divisions/divisionRow.ts'
import { toLaneEntry } from './entryRow.ts'
import { planLaneMove, type MoveFacts } from './movePlan.ts'
import { planPairChange } from './pairPlan.ts'
import type {
  LaneMove,
  LaneMoveResult,
  LaneWriter,
  PairChange,
  PairChangeResult,
  SessionKind,
} from './writer.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes: Record<SessionKind, number> = { squad: 0, sweeper: 1 }

/** A transaction fits. */
type FactsClient = Pick<
  PrismaClient,
  'tournament' | 'squad' | 'squadRegistration' | 'laneOutOfPlay'
>

type Read = { notFound: 'tournament' | 'session' } | { facts: MoveFacts }

/** What both writes read first: the tournament, the session, its entries, and its pairs out of play. */
async function readFacts(
  tx: FactsClient,
  input: { tournamentId: string; kind: SessionKind; sessionId: string },
): Promise<Read> {
  const tournament = await tx.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { completed: true },
  })
  if (!tournament) return { notFound: 'tournament' }
  // The tournament in the URL must own the row, and the row must be of this kind.
  const session = await tx.squad.findFirst({
    where: {
      id: input.sessionId,
      tournamentId: input.tournamentId,
      squadType: squadTypes[input.kind],
    },
  })
  if (!session) return { notFound: 'session' }

  const rows = await tx.squadRegistration.findMany({
    where: { squadId: input.sessionId },
    select: { registrationId: true, laneAssignment: true },
  })
  const out = await tx.laneOutOfPlay.findMany({
    where: { squadId: input.sessionId },
    select: { lane: true },
  })
  return {
    facts: {
      kind: input.kind,
      tournamentComplete: tournament.completed,
      sessionComplete: session.complete,
      startingLane: session.startingLane,
      numberOfLanes: session.numberOfLanes,
      maxPerPair: session.maxPerPair,
      outOfPlay: out.map((row) => row.lane),
      entries: rows.map((row) => ({
        registrationId: row.registrationId,
        position: row.laneAssignment ?? '',
      })),
    },
  }
}

/**
 * The entries of the session the lane page leaves out: a row that breaks the read shape, or a
 * division that is not one of the tournament's (D-51). Read with the page's own mappers, inside the
 * transaction, so the two cannot disagree (OOP-04).
 */
async function hiddenFromPage(
  tx: Pick<PrismaClient, 'squadRegistration' | 'division'>,
  input: { tournamentId: string; sessionId: string },
): Promise<ReadonlySet<string>> {
  const rows = await tx.squadRegistration.findMany({
    where: { squadId: input.sessionId },
    // Named columns only, as the lane page reads them (BWL-17).
    select: {
      registrationId: true,
      laneAssignment: true,
      registration: {
        select: {
          id: true,
          bowlerId: true,
          average: true,
          superSweeper: true,
          divisionId: true,
          bowler: { select: { firstName: true, lastName: true, suffix: true } },
        },
      },
    },
  })
  const divisions = await tx.division.findMany({ where: { tournamentId: input.tournamentId } })
  const readable = new Set(
    divisions.flatMap((row) => {
      const result = toDivision(row)
      return result.success ? [result.data.id] : []
    }),
  )
  return new Set(
    rows.flatMap((row) => {
      const result = toLaneEntry(row)
      return result.success && readable.has(result.data.divisionId) ? [] : [row.registrationId]
    }),
  )
}

/**
 * Moves bowlers in the legacy `SquadRegistration` table (D-216) and takes pairs out of play
 * (OOP-03). Each write reads the tournament, the session, every entry, and the pairs out of play and
 * writes in one serializable transaction, so two moves into the last seat of a pair cannot both
 * succeed, and a move cannot land on a pair as it goes out: MariaDB rolls one back (`P2034`),
 * `withRetry` runs it again, and it then sees the first write (Q-28). Only the one session's rows
 * are read, so rows of other sessions stay unlocked.
 */
export function createPrismaLaneWriter(client: PrismaClient, logger: Logger): LaneWriter {
  const moveOnce = (input: LaneMove): Promise<LaneMoveResult> =>
    client.$transaction(
      async (tx) => {
        const read = await readFacts(tx, input)
        if ('notFound' in read) return read
        const outcome = planLaneMove(read.facts, input.registrationId, input.lane)
        if (outcome.type === 'move') {
          await tx.squadRegistration.update({
            where: {
              registrationId_squadId: {
                registrationId: input.registrationId,
                squadId: input.sessionId,
              },
            },
            data: { laneAssignment: outcome.position },
          })
        }
        return outcome
      },
      { isolationLevel: 'Serializable' },
    )

  const setPairOnce = (input: PairChange): Promise<PairChangeResult> =>
    client.$transaction(
      async (tx) => {
        const read = await readFacts(tx, input)
        if ('notFound' in read) return read
        const hidden = await hiddenFromPage(tx, input)
        const entries = read.facts.entries.map((entry) => ({
          ...entry,
          hidden: hidden.has(entry.registrationId),
        }))
        const outcome = planPairChange({ ...read.facts, entries }, input)
        if (outcome.type !== 'save') return outcome
        const pair = { squadId: input.sessionId, lane: input.lane }
        if (input.inPlay) {
          await tx.laneOutOfPlay.deleteMany({ where: pair })
        } else {
          await tx.laneOutOfPlay.create({ data: pair })
          await tx.squadRegistration.updateMany({
            where: { squadId: input.sessionId, registrationId: { in: outcome.unassign } },
            data: { laneAssignment: '' },
          })
        }
        return outcome
      },
      { isolationLevel: 'Serializable' },
    )

  return {
    move: (input) => withDatabaseErrors(logger, () => withRetry(() => moveOnce(input))),
    setPair: (input) => withDatabaseErrors(logger, () => withRetry(() => setPairOnce(input))),
  }
}
