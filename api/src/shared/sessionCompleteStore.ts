import { withDatabaseErrors, type PrismaClient } from './database.ts'
import type { Logger } from './logger.ts'
import { withRetry } from './serializableRetry.ts'
import {
  applySessionComplete,
  planSessionComplete,
  squadCompleteInfo,
  zeroScores,
  type CompleteSessionOutcome,
  type EntryScores,
  type SessionCompleter,
  type SquadCompleteInfo,
  type SweeperCompleteInfo,
} from './sessionComplete.ts'
import type { SessionKind } from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'
import type { SessionRow } from './sessions.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes: Record<SessionKind, number> = { squad: 0, sweeper: 1 }

/** Both the client and a transaction fit. */
type ReadClient = Pick<
  PrismaClient,
  'division' | 'sweeperDivision' | 'squadRegistration' | 'squadScore'
>

/** The tournament values a squad falls back on (TRN-12), and its games (TRN-04). */
export interface CompleteDefaults {
  entryFee: number
  finalsRatio: number
  cashRatio: number
  games: number
}

/**
 * Turn the completed row into the list shape (the squad or sweeper page reads it). Return
 * `undefined` when the row breaks the read shape: the list skips such a row, so nothing here can
 * open it, and a complete must refuse before it writes (as an edit does).
 */
export type ReadCompleted<Session> = (
  client: ReadClient,
  row: SessionRow,
  tournamentId: string,
  defaults: CompleteDefaults,
) => Promise<Session | undefined>

const unreadable = (kind: SessionKind) => ({
  session: `This ${kind} holds values the app cannot read, so it cannot be completed here.`,
})

/** What the writes of a complete need. A transaction fits. */
type WriteClient = Pick<PrismaClient, 'squad' | 'squadScore'>

/**
 * The writes of one session's complete (D-190): a zero for each game of every no-show, then the
 * flag. The session route and the tournament route both call it, so the zero-fill is written once
 * (D-130, D-196). The caller has planned and chosen the no-shows.
 */
export async function writeSessionComplete(
  tx: WriteClient,
  sessionId: string,
  games: number,
  noShows: readonly string[],
): Promise<void> {
  if (noShows.length > 0) {
    await tx.squadScore.createMany({
      data: zeroScores(noShows, games).map(({ bowlerId, game }) => ({
        bowlerId,
        squadId: sessionId,
        game,
        score: 0,
      })),
    })
  }
  await tx.squad.update({ where: { id: sessionId }, data: { complete: true } })
}

/** Each entered bowler with the games saved in this session. Entries link to a registration; scores link to the bowler. */
export async function entriesOf(
  client: ReadClient,
  sessionId: string,
  games: number,
): Promise<EntryScores[]> {
  const entered = await client.squadRegistration.findMany({
    where: { squadId: sessionId },
    select: { registration: { select: { bowlerId: true } } },
  })
  const scores = await client.squadScore.findMany({
    // A stray row outside 1 to `games` (left by an earlier game count) is not a bowled game.
    where: { squadId: sessionId, game: { gte: 1, lte: games } },
    select: { bowlerId: true },
  })
  const saved = new Map<string, number>()
  for (const { bowlerId } of scores) saved.set(bowlerId, (saved.get(bowlerId) ?? 0) + 1)
  return entered.map(({ registration }) => ({
    bowlerId: registration.bowlerId,
    savedGames: saved.get(registration.bowlerId) ?? 0,
  }))
}

/**
 * The Prisma side of complete and complete-info for one kind of session (D-190 to D-192). One
 * serializable transaction reads the tournament and the row, plans, saves the squad's zeros, and
 * sets the flag, so a score or an entry saved between the read and the write is counted: the lost
 * race is retried. A sweeper saves no scores (D-191). The entries and scores are read inside the
 * transaction, unlike an edit's, because the zeros must match them.
 */
export function createSessionCompleter<
  Session,
  Info extends SquadCompleteInfo | SweeperCompleteInfo,
>(
  client: PrismaClient,
  logger: Logger,
  kind: SessionKind,
  readCompleted: ReadCompleted<Session>,
): SessionCompleter<Session, Info> {
  const squadType = squadTypes[kind]

  const completeOnce = (
    tournamentId: string,
    sessionId: string,
  ): Promise<CompleteSessionOutcome<Session>> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: {
            completed: true,
            games: true,
            entryFee: true,
            finalsRatio: true,
            cashRatio: true,
          },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the row, and the row must be of this kind.
        const row = await tx.squad.findFirst({ where: { id: sessionId, tournamentId, squadType } })
        if (!row) return { notFound: 'session' as const }

        // A refusal comes first: it needs no read of the finished session.
        const facts = { completed: tournament.completed, complete: row.complete }
        const plan = planSessionComplete(facts, kind)
        if (plan.kind === 'refused') return { refused: plan.errors }

        const defaults = {
          entryFee: tournament.entryFee.toNumber(),
          finalsRatio: tournament.finalsRatio.toNumber(),
          cashRatio: tournament.cashRatio.toNumber(),
          games: tournament.games,
        }
        // Read the finished session before any write. A row the list cannot read stays untouched.
        const completed = await readCompleted(
          tx,
          { ...row, complete: true },
          tournamentId,
          defaults,
        )
        if (completed === undefined) {
          logger.warn({ sessionId, tournamentId }, `Stored ${kind} breaks the read shape`)
          return { refused: unreadable(kind) }
        }
        const entries = kind === 'squad' ? await entriesOf(tx, sessionId, tournament.games) : []
        const result = await applySessionComplete(facts, kind, entries, (noShows) =>
          writeSessionComplete(tx, sessionId, tournament.games, noShows),
        )
        if ('refused' in result) return result
        return { completed, noShowCount: result.noShowCount }
      },
      // The entries, the scores, and the writes must not interleave with a score or an entry (D-192).
      { isolationLevel: 'Serializable' },
    )

  return {
    complete: (tournamentId, sessionId) =>
      withDatabaseErrors(logger, () => withRetry(() => completeOnce(tournamentId, sessionId))),
    getCompleteInfo: (tournamentId, sessionId) =>
      withDatabaseErrors(logger, async (): Promise<Info | SessionNotFound> => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { games: true },
        })
        if (!tournament) return { notFound: 'tournament' }
        const row = await client.squad.findFirst({
          where: { id: sessionId, tournamentId, squadType },
          select: { id: true },
        })
        if (!row) return { notFound: 'session' }
        const entries = await entriesOf(client, sessionId, tournament.games)
        const info =
          kind === 'squad'
            ? squadCompleteInfo(entries, tournament.games)
            : { entryCount: new Set(entries.map((entry) => entry.bowlerId)).size }
        return info as Info
      }),
  }
}
