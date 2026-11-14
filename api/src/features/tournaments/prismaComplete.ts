import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { noShowBowlers, squadCompleteInfo } from '../../shared/sessionComplete.ts'
import {
  entriesOf,
  writeSessionComplete,
  type ReadCompleted,
} from '../../shared/sessionCompleteStore.ts'
import type { SessionKind } from '../../shared/sessionDelete.ts'
import { readCompletedSquad } from '../squads/prismaWriter.ts'
import { readCompletedSweeper } from '../sweepers/prismaWriter.ts'
import {
  applyComplete,
  type ClosedSession,
  type CompleteTournamentOutcome,
  type TournamentCompleteInfo,
  type TournamentWriter,
} from './writer.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const kindOf = (squadType: number): SessionKind => (squadType === 1 ? 'sweeper' : 'squad')

const unreadable = (kind: SessionKind) => ({
  session: `A ${kind} holds values the app cannot read, so the tournament cannot be completed here.`,
})

/** The reader for each kind of session, as its list shows it. */
const readers: Record<SessionKind, ReadCompleted<unknown>> = {
  squad: readCompletedSquad,
  sweeper: readCompletedSweeper,
}

/**
 * The Prisma side of complete and complete-info for a tournament (TRN-38 to TRN-41, D-256 to
 * D-259). One serializable transaction reads the tournament and every session, applies the rules,
 * writes each open session through the same step the session route uses (zeros for a squad's
 * no-shows, then the flag), and sets `Completed`. A score or an entry saved a moment earlier is
 * counted, and a failure leaves nothing half closed. Every open session is read before any write,
 * so a row the lists cannot read refuses the whole call with nothing saved (D-257).
 */
export function createTournamentCompleter(
  client: PrismaClient,
  logger: Logger,
): Pick<TournamentWriter, 'complete' | 'getCompleteInfo'> {
  const completeOnce = (id: string): Promise<CompleteTournamentOutcome> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id },
          select: {
            completed: true,
            games: true,
            entryFee: true,
            finalsRatio: true,
            cashRatio: true,
          },
        })
        if (!tournament) return { notFound: true as const }
        const rows = await tx.squad.findMany({ where: { tournamentId: id } })
        const squadCount = rows.filter((row) => kindOf(row.squadType) === 'squad').length

        return applyComplete({ completed: tournament.completed, squadCount }, async () => {
          const defaults = {
            entryFee: tournament.entryFee.toNumber(),
            finalsRatio: tournament.finalsRatio.toNumber(),
            cashRatio: tournament.cashRatio.toNumber(),
            games: tournament.games,
          }
          const open = rows.filter((row) => !row.complete)
          // Read every open session as the list shows it before any write.
          for (const row of open) {
            const kind = kindOf(row.squadType)
            const read = await readers[kind](tx, { ...row, complete: true }, id, defaults)
            if (read === undefined) {
              logger.warn(
                { tournamentId: id, sessionId: row.id },
                `Stored ${kind} breaks the read shape`,
              )
              return { refused: unreadable(kind) }
            }
          }
          // One transaction runs on one connection, so these queue in order.
          const results = await Promise.all(
            open.map(async (row) => {
              const kind = kindOf(row.squadType)
              const noShows =
                kind === 'squad' ? noShowBowlers(await entriesOf(tx, row.id, tournament.games)) : []
              await writeSessionComplete(tx, row.id, tournament.games, noShows)
              return { session: { kind, id: row.id } as ClosedSession, noShows: noShows.length }
            }),
          )
          const closed: ClosedSession[] = results.map((result) => result.session)
          const noShowCount = results.reduce((sum, result) => sum + result.noShows, 0)
          await tx.tournament.update({ where: { id }, data: { completed: true } })
          return {
            completed: {
              squadsCompleted: closed.filter((session) => session.kind === 'squad').length,
              sweepersCompleted: closed.filter((session) => session.kind === 'sweeper').length,
              noShowCount,
              closed,
            },
          }
        })
      },
      // The entries, the scores, and the writes must not interleave with a score or an entry (D-258).
      { isolationLevel: 'Serializable' },
    )

  return {
    complete: (id) => withDatabaseErrors(logger, () => withRetry(() => completeOnce(id))),
    getCompleteInfo: (id) =>
      withDatabaseErrors(logger, () =>
        // One transaction, so every count comes from the same moment.
        client.$transaction(
          async (tx): Promise<TournamentCompleteInfo | { notFound: true }> => {
            const tournament = await tx.tournament.findUnique({
              where: { id },
              select: { games: true },
            })
            if (!tournament) return { notFound: true }
            const rows = await tx.squad.findMany({
              where: { tournamentId: id },
              select: { id: true, squadType: true, complete: true },
            })
            const squads = rows.filter((row) => kindOf(row.squadType) === 'squad')
            const openSquads = squads.filter((row) => !row.complete)
            const infos = await Promise.all(
              openSquads.map(async (squad) =>
                squadCompleteInfo(
                  await entriesOf(tx, squad.id, tournament.games),
                  tournament.games,
                ),
              ),
            )
            const [payoutCount, unpaid] = await Promise.all([
              tx.payout.count({ where: { tournamentId: id } }),
              tx.payout.aggregate({
                where: { tournamentId: id, paid: false },
                _count: true,
                _sum: { amount: true },
              }),
            ])
            const noScoreCount = infos.reduce((sum, info) => sum + info.noScoreCount, 0)
            const partialCount = infos.reduce((sum, info) => sum + info.partialCount, 0)
            return {
              squadCount: squads.length,
              openSquadCount: openSquads.length,
              openSweeperCount: rows.filter(
                (row) => kindOf(row.squadType) === 'sweeper' && !row.complete,
              ).length,
              noScoreCount,
              partialCount,
              payoutCount,
              unpaidPayoutCount: unpaid._count,
              unpaidPayoutTotal: unpaid._sum.amount?.toFixed(2) ?? '0.00',
            }
          },
          { isolationLevel: 'RepeatableRead' },
        ),
      ),
  }
}
