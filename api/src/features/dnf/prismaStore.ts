import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { DnfStore } from './store.ts'

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
    clear: (sessionId, registrationId) =>
      withDatabaseErrors(logger, async () => {
        const { count } = await client.sessionDnf.deleteMany({
          where: { sessionId, registrationId },
        })
        return count > 0
      }),
  }
}
