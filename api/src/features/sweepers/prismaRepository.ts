import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import type { SweeperRepository } from './repository.ts'
import { toSweeper } from './sweeperRow.ts'

/** `Squads.SquadType` for a sweeper. A squad is 0; any other value is not read (D-42). */
const sweeperType = 1

/** Reads the legacy `Squads` and `SweeperDivision` tables. Read only: add, edit, and delete come later. */
export function createPrismaSweeperRepository(
  client: PrismaClient,
  logger: Logger,
): SweeperRepository {
  return {
    async listByTournament(tournamentId) {
      const { rows, divisions, pins } = await withDatabaseErrors(logger, async () => {
        // The sweepers and the divisions do not depend on each other, so they load together.
        const [sweepers, tournamentDivisions] = await Promise.all([
          client.squad.findMany({
            where: { tournamentId, squadType: sweeperType },
            // SQD-20, D-45.
            orderBy: [{ date: 'asc' }, { startingLane: 'asc' }, { id: 'asc' }],
          }),
          // The tournament's own divisions, in DIV-13 order. A pin row for any other division is ignored.
          client.division.findMany({
            where: { tournamentId },
            select: { id: true, name: true },
            orderBy: [{ number: 'asc' }, { name: 'asc' }],
          }),
        ])
        const pinRows = await client.sweeperDivision.findMany({
          where: { sweeperId: { in: sweepers.map((sweeper) => sweeper.id) } },
        })
        return { rows: sweepers, divisions: tournamentDivisions, pins: pinRows }
      })

      // Group once: sweeper id, then division id, then the stored pins.
      const pinsBySweeper = new Map<string, Map<string, number | null>>()
      for (const { sweeperId, divisionId, bonusPinsPerGame } of pins) {
        const own = pinsBySweeper.get(sweeperId) ?? new Map<string, number | null>()
        own.set(divisionId, bonusPinsPerGame)
        pinsBySweeper.set(sweeperId, own)
      }

      return rows.flatMap((row) => {
        const own = pinsBySweeper.get(row.id)
        const result = toSweeper(
          row,
          divisions.map(({ id, name }) => ({
            divisionId: id,
            divisionName: name,
            bonusPinsPerGame: own?.get(id),
          })),
        )
        if (result.success) return [result.data]
        // D-42: one old row must not hide the rest.
        logger.warn(
          { sweeperId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored sweeper that breaks the read shape',
        )
        return []
      })
    },
  }
}
