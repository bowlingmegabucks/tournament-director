import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import type { DnfStore } from './store.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes = { squad: 0, sweeper: 1 }

/** The DNF flags in the `SessionDnf` table (D-248). */
export function createPrismaDnfStore(client: PrismaClient, logger: Logger): DnfStore {
  return {
    listFlagged: (sessionIds) =>
      withDatabaseErrors(logger, async () => {
        const found = new Map<string, Set<string>>()
        if (sessionIds.length === 0) return found
        const rows = await client.sessionDnf.findMany({
          where: { sessionId: { in: [...sessionIds] } },
        })
        for (const { sessionId, registrationId } of rows) {
          found.set(sessionId, (found.get(sessionId) ?? new Set()).add(registrationId))
        }
        return found
      }),
    set: (sessionId, registrationId) =>
      withDatabaseErrors(logger, async () => {
        // A repeat adds nothing: the row exists, so the count of new rows is 0.
        const { count } = await client.sessionDnf.createMany({
          data: [{ sessionId, registrationId }],
          skipDuplicates: true,
        })
        return count > 0
      }),
    setIfOpen: (input) =>
      withDatabaseErrors(logger, () =>
        withRetry(() =>
          client.$transaction(
            async (tx) => {
              const tournament = await tx.tournament.findUnique({
                where: { id: input.tournamentId },
                select: { completed: true },
              })
              const session = await tx.squad.findFirst({
                where: {
                  id: input.sessionId,
                  tournamentId: input.tournamentId,
                  squadType: squadTypes[input.kind],
                },
                select: { complete: true },
              })
              if (!tournament || !session || tournament.completed || session.complete) {
                return 'complete' as const
              }
              const entry = await tx.squadRegistration.findUnique({
                where: {
                  registrationId_squadId: {
                    registrationId: input.registrationId,
                    squadId: input.sessionId,
                  },
                },
                select: { registration: { select: { bowlerId: true } } },
              })
              const scored = entry
                ? await tx.squadScore.findFirst({
                    where: { bowlerId: entry.registration.bowlerId, squadId: input.sessionId },
                    select: { game: true },
                  })
                : null
              if (!scored) return 'no-score' as const
              const { count } = await tx.sessionDnf.createMany({
                data: [{ sessionId: input.sessionId, registrationId: input.registrationId }],
                skipDuplicates: true,
              })
              return count > 0 ? ('set' as const) : ('same' as const)
            },
            { isolationLevel: 'Serializable' },
          ),
        ),
      ),
    clear: (sessionId, registrationId) =>
      withDatabaseErrors(logger, async () => {
        const { count } = await client.sessionDnf.deleteMany({
          where: { sessionId, registrationId },
        })
        return count > 0
      }),
  }
}
