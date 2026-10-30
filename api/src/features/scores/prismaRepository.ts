import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import { warnOnce } from '../../shared/warnOnce.ts'
import type { ScoreRepository } from './repository.ts'
import { toScoreRow } from './scoreRow.ts'

/** Reads the saved game scores of one squad or sweeper from the legacy `SquadScores` table. Read only. */
export function createPrismaScoreRepository(client: PrismaClient, logger: Logger): ScoreRepository {
  // A bad row stays bad on every poll. Say so once per process (D-69).
  const reported = new Set<string>()

  return {
    async listScores(sessionId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.squadScore.findMany({
          where: { squadId: sessionId },
          select: { bowlerId: true, game: true, score: true },
        }),
      )
      return rows.flatMap((row) => {
        const result = toScoreRow(row)
        if (result.success) return [result.data]
        warnOnce(
          reported,
          `${sessionId}:${row.bowlerId}:${row.game}`,
          logger,
          {
            bowlerId: row.bowlerId,
            sessionId,
            game: row.game,
            problems: result.error.issues.map(describeIssue),
          },
          'Skipped a stored score that breaks the read shape',
        )
        return []
      })
    },
  }
}
