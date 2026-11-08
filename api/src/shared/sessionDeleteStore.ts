import { withDatabaseErrors, type PrismaClient } from './database.ts'
import type { Logger } from './logger.ts'
import { withRetry } from './serializableRetry.ts'
import {
  applySessionDelete,
  type DeleteSessionOutcome,
  type SessionDeleteInfo,
  type SessionDeleter,
  type SessionKind,
} from './sessionDelete.ts'
import type { SessionNotFound } from './sessionEdit.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes: Record<SessionKind, number> = { squad: 0, sweeper: 1 }

/**
 * The Prisma side of delete and delete-info for one kind of session (D-189). One serializable
 * transaction reads the tournament and the row, counts the entries and scores, plans, and deletes.
 * The counts are read inside it, unlike an edit's, so an entry or score saved in between is caught:
 * the lost race is retried and then answers `409`. A sweeper's `SweeperDivision` rows go by the
 * database cascade (D-152); entries and scores have no cascade and a refusal needs both at 0.
 */
export function createSessionDeleter(
  client: PrismaClient,
  logger: Logger,
  kind: SessionKind,
): SessionDeleter {
  const squadType = squadTypes[kind]

  const removeOnce = (tournamentId: string, sessionId: string): Promise<DeleteSessionOutcome> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the row, and the row must be of this kind. The row
        // need not read as a valid session: the list skips a bad one, and deleting it cleans up.
        const row = await tx.squad.findFirst({
          where: { id: sessionId, tournamentId, squadType },
          select: { complete: true },
        })
        if (!row) return { notFound: 'session' as const }
        const [entryCount, scoreCount] = await Promise.all([
          tx.squadRegistration.count({ where: { squadId: sessionId } }),
          tx.squadScore.count({ where: { squadId: sessionId } }),
        ])
        return applySessionDelete(
          { completed: tournament.completed, complete: row.complete, entryCount, scoreCount },
          kind,
          async () => {
            await tx.squad.delete({ where: { id: sessionId } })
          },
        )
      },
      // The counts and the delete must not interleave with an entry or a score (D-189).
      { isolationLevel: 'Serializable' },
    )

  return {
    remove: (tournamentId, sessionId) =>
      withDatabaseErrors(logger, () => withRetry(() => removeOnce(tournamentId, sessionId))),
    getDeleteInfo: (tournamentId, sessionId) =>
      withDatabaseErrors(logger, async (): Promise<SessionDeleteInfo | SessionNotFound> => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true },
        })
        if (!tournament) return { notFound: 'tournament' }
        const row = await client.squad.findFirst({
          where: { id: sessionId, tournamentId, squadType },
          select: { id: true },
        })
        if (!row) return { notFound: 'session' }
        const [entryCount, scoreCount] = await Promise.all([
          client.squadRegistration.count({ where: { squadId: sessionId } }),
          client.squadScore.count({ where: { squadId: sessionId } }),
        ])
        return { entryCount, scoreCount }
      }),
  }
}
