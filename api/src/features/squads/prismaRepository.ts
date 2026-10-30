import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import { compareSessions } from '../../shared/sessions.ts'
import type { SquadRepository } from './repository.ts'
import { toSquad } from './squadRow.ts'

/** `Squads.SquadType` for a qualifying squad. A sweeper is 1; any other value is not read (D-42). */
const squadType = 0

/** Reads the legacy `Squads` table. Read only: add, edit, and delete come later. */
export function createPrismaSquadRepository(client: PrismaClient, logger: Logger): SquadRepository {
  return {
    async listByTournament(tournamentId) {
      // One call: each squad brings the tournament values it falls back on (TRN-12). A tournament
      // with no squads, or none at all, gives an empty list; the route answers 404 for an unknown one.
      const rows = await withDatabaseErrors(logger, () =>
        client.squad.findMany({
          where: { tournamentId, squadType },
          include: {
            tournament: { select: { entryFee: true, finalsRatio: true, cashRatio: true, games: true } },
          },
        }),
      )
      const squads = rows.flatMap((row) => {
        const result = toSquad(row, {
          entryFee: row.tournament.entryFee.toNumber(),
          finalsRatio: row.tournament.finalsRatio.toNumber(),
          cashRatio: row.tournament.cashRatio.toNumber(),
          games: row.tournament.games,
        })
        if (result.success) return [result.data]
        // D-42: one old row must not hide the rest.
        logger.warn(
          { squadId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored squad that breaks the read shape',
        )
        return []
      })
      // SQD-20, D-45. Sorted here, not by the database, so one function decides every tie.
      return squads.sort(compareSessions)
    },
  }
}
