import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { TournamentRepository } from './repository.ts'
import { toTournament } from './tournamentRow.ts'

/** Reads the legacy `Tournaments` table. Read only: create, edit, and delete come later. */
export function createPrismaTournamentRepository(
  client: PrismaClient,
  logger: Logger,
): TournamentRepository {
  return {
    async list() {
      const rows = await withDatabaseErrors(logger, () => client.tournament.findMany())
      return rows.flatMap((row) => {
        const result = toTournament(row)
        if (result.success) return [result.data]
        // D-31: one old row must not hide the rest.
        logger.warn(
          { tournamentId: row.id, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored tournament that breaks the vendor shape',
        )
        return []
      })
    },

    async get(id) {
      const row = await withDatabaseErrors(logger, () =>
        client.tournament.findUnique({ where: { id } }),
      )
      if (!row) return undefined
      const result = toTournament(row)
      if (!result.success) {
        // D-31: the detail route answers 500; the error handler logs this message.
        throw new Error(
          `Stored tournament ${id} breaks the vendor shape: ${result.error.issues.map(describeIssue).join('; ')}`,
        )
      }
      return result.data
    },
  }
}

function describeIssue(issue: { path: PropertyKey[]; message: string }): string {
  // Stryker disable next-line StringLiteral: a flat row gives one-element paths, so '.' and '' match.
  return `${issue.path.map(String).join('.')}: ${issue.message}`
}
