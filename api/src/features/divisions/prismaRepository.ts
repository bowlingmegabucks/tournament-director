import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import { toDivision } from './divisionRow.ts'
import type { DivisionRepository } from './repository.ts'

/** Reads the legacy `Divisions` table. Read only: create, edit, and delete come later. */
export function createPrismaDivisionRepository(
  client: PrismaClient,
  logger: Logger,
): DivisionRepository {
  return {
    async listByTournament(tournamentId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.division.findMany({
          where: { tournamentId },
          // DIV-13, D-38: number is not unique in old data, so the name breaks a tie.
          orderBy: [{ number: 'asc' }, { name: 'asc' }],
        }),
      )
      return rows.flatMap((row) => {
        const result = toDivision(row)
        if (result.success) return [result.data]
        // D-39: one old row must not hide the rest.
        logger.warn(
          { divisionId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored division that breaks the read shape',
        )
        return []
      })
    },
  }
}
