import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { DEFAULT_SKIP, skipSchema, type SkipStore } from './store.ts'

/**
 * The skip in the `SessionSkip` table (D-235). A missing row, or a stored text that is not a skip
 * we know, reads as staggered: a hand-edited row cannot break the lane page.
 */
export function createPrismaSkipStore(client: PrismaClient, logger: Logger): SkipStore {
  return {
    get: (sessionId) =>
      withDatabaseErrors(logger, async () => {
        const row = await client.sessionSkip.findUnique({ where: { sessionId } })
        const parsed = skipSchema.safeParse(row?.skip)
        return parsed.success ? parsed.data : DEFAULT_SKIP
      }),
    set: (sessionId, skip) =>
      withDatabaseErrors(logger, async () => {
        await client.sessionSkip.upsert({
          where: { sessionId },
          create: { sessionId, skip },
          update: { skip },
        })
      }),
  }
}
