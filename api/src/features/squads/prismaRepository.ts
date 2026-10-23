import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import type { SquadRepository } from './repository.ts'
import { toSquad } from './squadRow.ts'

/** `Squads.SquadType` for a qualifying squad. A sweeper is 1; any other value is not read (D-42). */
const squadType = 0

/** Reads the legacy `Squads` table. Read only: add, edit, and delete come later. */
export function createPrismaSquadRepository(client: PrismaClient, logger: Logger): SquadRepository {
  return {
    async listByTournament(tournamentId) {
      const [tournament, rows] = await withDatabaseErrors(logger, () =>
        Promise.all([
          client.tournament.findUnique({
            where: { id: tournamentId },
            select: { entryFee: true, finalsRatio: true, cashRatio: true },
          }),
          client.squad.findMany({
            where: { tournamentId, squadType },
            // SQD-20, D-45.
            orderBy: [{ date: 'asc' }, { startingLane: 'asc' }, { id: 'asc' }],
          }),
        ]),
      )
      // The route answers 404 for an unknown tournament; there is nothing to fall back on here.
      if (!tournament) return []
      const defaults = {
        entryFee: tournament.entryFee.toNumber(),
        finalsRatio: tournament.finalsRatio.toNumber(),
        cashRatio: tournament.cashRatio.toNumber(),
      }
      return rows.flatMap((row) => {
        const result = toSquad(row, defaults)
        if (result.success) return [result.data]
        // D-42: one old row must not hide the rest.
        logger.warn(
          { squadId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored squad that breaks the read shape',
        )
        return []
      })
    },
  }
}
